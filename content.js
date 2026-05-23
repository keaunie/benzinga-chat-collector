console.log("Benzinga Collector Loaded");

const processedIds = new Set();

// TARGET = 5AM PST
const TARGET_MINUTES = 5 * 60;

const NETLIFY_BASE_URL = "https://benzinga-chat-collector.netlify.app";
const INGEST_PATH = "/api/benzinga-message";
const MAX_QUEUE_SIZE = 20000;
const RETRY_DELAYS_MS = [1500, 5000, 15000, 60000, 180000];

let pipelineQueue = [];
let pipelineFlushScheduled = false;
let pipelineFlushing = false;
let pipelineConfig = {
  baseUrl: NETLIFY_BASE_URL,
};

function sanitizeText(value, maxLength = 8000) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function parseTimeToMinutes(timeStr) {
  const match = timeStr.match(/(\d+):(\d+)(AM|PM)/i);

  if (!match) return null;

  let [, h, m, ap] = match;

  h = parseInt(h);
  m = parseInt(m);

  if (ap.toUpperCase() === "PM" && h !== 12) {
    h += 12;
  }

  if (ap.toUpperCase() === "AM" && h === 12) {
    h = 0;
  }

  return h * 60 + m;
}

function getIngestUrl() {
  const trimmed = (pipelineConfig.baseUrl || NETLIFY_BASE_URL).replace(/\/$/, "");
  return `${trimmed}${INGEST_PATH}`;
}

function persistPipelineState() {
  chrome.storage.local.set({
    messagePipelineQueue: pipelineQueue,
  });
}

function pruneQueue() {
  if (pipelineQueue.length > MAX_QUEUE_SIZE) {
    pipelineQueue = pipelineQueue.slice(pipelineQueue.length - MAX_QUEUE_SIZE);
  }
}

function enqueueForPipeline(messagePayload) {
  const entry = {
    payload: {
      id: sanitizeText(messagePayload.id, 256),
      username: sanitizeText(messagePayload.username, 512) || "Unknown",
      timestamp: sanitizeText(messagePayload.timestamp, 128),
      message: sanitizeText(messagePayload.message, 8000),
      capturedAt: messagePayload.capturedAt,
    },
    attempts: 0,
    nextAttemptAt: Date.now(),
  };

  if (!entry.payload.id || !entry.payload.message) {
    return;
  }

  pipelineQueue.push(entry);
  pruneQueue();
  persistPipelineState();
  schedulePipelineFlush(0);
}

function retryDelayForAttempt(attempt) {
  return RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
}

function schedulePipelineFlush(delayMs) {
  if (pipelineFlushScheduled) {
    return;
  }

  pipelineFlushScheduled = true;

  setTimeout(() => {
    pipelineFlushScheduled = false;
    flushPipelineQueue();
  }, delayMs);
}

async function postToPipeline(entry) {
  const response = await fetch(getIngestUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(entry.payload),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    const retryable = response.status >= 429 || response.status >= 500;
    const error = new Error(
      `Pipeline POST failed (${response.status}) ${retryable ? "retryable" : "non-retryable"}`,
    );
    error.retryable = retryable;
    error.details = errBody;
    throw error;
  }
}

async function flushPipelineQueue() {
  if (pipelineFlushing) return;

  pipelineFlushing = true;

  try {
    while (pipelineQueue.length > 0) {
      const now = Date.now();
      const current = pipelineQueue[0];

      if (!current || typeof current !== "object") {
        pipelineQueue.shift();
        continue;
      }

      if (current.nextAttemptAt > now) {
        schedulePipelineFlush(current.nextAttemptAt - now);
        break;
      }

      try {
        await postToPipeline(current);
        pipelineQueue.shift();
        persistPipelineState();
      } catch (error) {
        current.attempts += 1;

        if (error.retryable) {
          current.nextAttemptAt = Date.now() + retryDelayForAttempt(current.attempts);
          persistPipelineState();
          schedulePipelineFlush(retryDelayForAttempt(current.attempts));
          break;
        }

        console.error("Dropping non-retryable pipeline payload", {
          id: current.payload?.id,
          error: error?.message,
          details: error?.details,
        });
        pipelineQueue.shift();
        persistPipelineState();
      }
    }
  } finally {
    pipelineFlushing = false;
  }
}

function loadPipelineState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      ["messagePipelineQueue", "pipelineBaseUrl"],
      (result) => {
        pipelineQueue = Array.isArray(result.messagePipelineQueue)
          ? result.messagePipelineQueue
          : [];

        pipelineConfig = {
          baseUrl:
            typeof result.pipelineBaseUrl === "string" && result.pipelineBaseUrl.trim()
              ? result.pipelineBaseUrl.trim()
              : NETLIFY_BASE_URL,
        };

        pruneQueue();
        resolve();
      },
    );
  });
}

function extractMessages() {
  const messages = document.querySelectorAll("li.str-chat__li");

  messages.forEach((msg) => {
    try {
      const messageId = msg.getAttribute("data-message-id");

      if (!messageId) return;

      if (processedIds.has(messageId)) {
        return;
      }

      processedIds.add(messageId);

      const userEl = msg.querySelector(".str-chat__message-team-author");

      const username = userEl?.innerText?.trim() || "Unknown";

      const timeEl = msg.querySelector("time");

      const timestamp =
        timeEl?.innerText?.trim() || new Date().toLocaleTimeString();

      const textEl = msg.querySelector(
        '[data-testid="message-team-message"] p',
      );

      const message = textEl?.innerText?.trim();

      if (!message) return;

      const payload = {
        id: messageId,
        username,
        timestamp,
        message,
        capturedAt: new Date().toISOString(),
      };

      console.log("CHAT MESSAGE:", payload);

      chrome.storage.local.get(["messages"], (result) => {
        const storedMessages = result.messages || [];

        storedMessages.push(payload);

        chrome.storage.local.set({
          messages: storedMessages,
        });
      });

      enqueueForPipeline(payload);
    } catch (err) {
      console.error(err);
    }
  });
}

async function getScrollContainer() {
  let retries = 0;

  while (retries < 30) {
    const chatMessages = document.querySelector("li.str-chat__li");

    if (chatMessages) {
      console.log("Chat messages loaded");

      let parent = chatMessages.parentElement;

      while (parent) {
        const style = getComputedStyle(parent);

        const isScrollable =
          (style.overflowY === "auto" || style.overflowY === "scroll") &&
          parent.scrollHeight > parent.clientHeight;

        if (isScrollable) {
          console.log("SCROLL CONTAINER FOUND:", parent);

          return parent;
        }

        parent = parent.parentElement;
      }
    }

    retries++;

    console.log("Waiting for scroll container...");

    await new Promise((r) => setTimeout(r, 1000));
  }

  return null;
}

async function backreadToTarget() {
  console.log("Starting backread...");

  let reachedTarget = false;

  let attempts = 0;

  while (!reachedTarget && attempts < 300) {
    attempts++;

    const scrollContainer = await getScrollContainer();

    if (!scrollContainer) {
      console.error("Lost scroll container");

      break;
    }

    extractMessages();

    const messages = document.querySelectorAll("li.str-chat__li");

    let oldestMinutes = null;

    let oldestMessageData = null;

    messages.forEach((msg) => {
      const timeEl = msg.querySelector("time");

      const timestamp = timeEl?.innerText?.trim();

      if (!timestamp) return;

      const mins = parseTimeToMinutes(timestamp);

      if (mins !== null) {
        if (oldestMinutes === null || mins < oldestMinutes) {
          oldestMinutes = mins;

          const textEl = msg.querySelector(
            '[data-testid="message-team-message"] p',
          );

          const message = textEl?.innerText?.trim() || "No message";

          const userEl = msg.querySelector(".str-chat__message-team-author");

          const username = userEl?.innerText?.trim() || "Unknown";

          oldestMessageData = {
            username,
            timestamp,
            message,
          };
        }
      }
    });

    console.log("Oldest loaded message:", oldestMessageData);

    console.table([oldestMessageData]);

    // STOP AT TARGET TIME
    if (oldestMinutes !== null && oldestMinutes <= TARGET_MINUTES) {
      console.log("Reached target time");

      reachedTarget = true;

      break;
    }

    // TOP MESSAGE BEFORE
    const firstMessageBefore = document
      .querySelector("li.str-chat__li")
      ?.getAttribute("data-message-id");

    console.log("Top message before:", firstMessageBefore);

    // FORCE SCROLL UP
    scrollContainer.scrollTop = 0;

    console.log("Scrolling upward...");

    let loaded = false;

    // WAIT FOR OLDER MESSAGES
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));

      // KEEP PUSHING UP
      scrollContainer.scrollTop = 0;

      // NEW TOP MESSAGE
      const firstMessageAfter = document
        .querySelector("li.str-chat__li")
        ?.getAttribute("data-message-id");

      console.log("Top message after:", firstMessageAfter);

      // OLDER HISTORY LOADED
      if (firstMessageAfter && firstMessageAfter !== firstMessageBefore) {
        console.log("Older messages loaded");

        loaded = true;

        break;
      }

      console.log("Waiting for older messages...");
    }

    // NO MORE HISTORY
    if (!loaded) {
      console.log("No more older messages found");

      break;
    }
  }

  console.log("Backread complete");
}

// WATCH LIVE MESSAGES
const observer = new MutationObserver(() => {
  extractMessages();
});

async function initializeCollector() {
  await loadPipelineState();

  schedulePipelineFlush(0);

  console.log("Waiting for Benzinga chat...");

  let retries = 0;

  while (retries < 60) {
    const chatLoaded = document.querySelector("li.str-chat__li");

    if (chatLoaded) {
      console.log("Chat detected. Starting collector...");

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      extractMessages();

      backreadToTarget();

      return;
    }

    retries++;

    await new Promise((r) => setTimeout(r, 1000));
  }

  console.error("Chat failed to load after waiting.");
}

initializeCollector();
