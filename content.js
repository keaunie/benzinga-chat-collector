console.log("Benzinga Collector Loaded");

const processedIds = new Set();

// TARGET = 3AM PST
const TARGET_MINUTES = 5 * 60;

function parseTimeToMinutes(timeStr) {

    const match =
        timeStr.match(/(\d+):(\d+)(AM|PM)/i);

    if (!match) return null;

    let [, h, m, ap] = match;

    h = parseInt(h);
    m = parseInt(m);

    if (
        ap.toUpperCase() === "PM" &&
        h !== 12
    ) {
        h += 12;
    }

    if (
        ap.toUpperCase() === "AM" &&
        h === 12
    ) {
        h = 0;
    }

    return h * 60 + m;
}

function extractMessages() {

    const messages =
        document.querySelectorAll(
            'li.str-chat__li'
        );

    messages.forEach((msg) => {

        try {

            // UNIQUE MESSAGE ID
            const messageId =
                msg.getAttribute(
                    "data-message-id"
                );

            if (!messageId) return;

            // AVOID DUPLICATES
            if (
                processedIds.has(messageId)
            ) {
                return;
            }

            processedIds.add(messageId);

            // USERNAME
            const userEl =
                msg.querySelector(
                    '.str-chat__message-team-author'
                );

            const username =
                userEl?.innerText?.trim()
                || "Unknown";

            // TIMESTAMP
            const timeEl =
                msg.querySelector("time");

            const timestamp =
                timeEl?.innerText?.trim()
                || new Date()
                    .toLocaleTimeString();

            // MESSAGE TEXT
            const textEl =
                msg.querySelector(
                    '[data-testid="message-team-message"] p'
                );

            const message =
                textEl?.innerText?.trim();

            if (!message) return;

            const payload = {
                id: messageId,
                username,
                timestamp,
                message,
                capturedAt:
                    new Date().toISOString()
            };

            console.log(
                "CHAT MESSAGE:",
                payload
            );

            // SAVE LOCALLY
            chrome.storage.local.get(
                ["messages"],
                (result) => {

                    const messages =
                        result.messages || [];

                    messages.push(payload);

                    chrome.storage.local.set({
                        messages
                    });
                }
            );

        } catch (err) {

            console.error(err);
        }
    });
}

function getScrollContainer() {

    // FIND THE CHAT AREA
    const chatMessages =
        document.querySelector(
            'li.str-chat__li'
        );

    if (!chatMessages) {

        console.error(
            "No chat messages found"
        );

        return null;
    }

    let parent =
        chatMessages.parentElement;

    // WALK UP DOM TREE
    while (parent) {

        const style =
            getComputedStyle(parent);

        const isScrollable =
            (
                style.overflowY === 'auto' ||
                style.overflowY === 'scroll'
            ) &&
            parent.scrollHeight >
            parent.clientHeight;

        if (isScrollable) {

            console.log(
                "SCROLL CONTAINER FOUND:",
                parent
            );

            return parent;
        }

        parent =
            parent.parentElement;
    }

    return null;
}

async function backreadTo3AM() {

    console.log(
        "Starting backread..."
    );

    const scrollContainer =
        getScrollContainer();

    if (!scrollContainer) {

        console.error(
            "Scrollable container not found"
        );

        return;
    }

    console.log(
        "FOUND SCROLL CONTAINER:",
        scrollContainer
    );

    let reachedTarget = false;

    let attempts = 0;

    while (
        !reachedTarget &&
        attempts < 100
    ) {

        attempts++;

        // EXTRACT CURRENTLY LOADED
        extractMessages();

        const messages =
            document.querySelectorAll(
                'li.str-chat__li'
            );

        let oldestMinutes = null;

        messages.forEach(msg => {

            const timeEl =
                msg.querySelector("time");

            const timestamp =
                timeEl?.innerText?.trim();

            if (!timestamp) return;

            const mins =
                parseTimeToMinutes(
                    timestamp
                );

            if (mins !== null) {

                if (
                    oldestMinutes === null ||
                    mins < oldestMinutes
                ) {

                    oldestMinutes = mins;
                }
            }
        });

        console.log(
            "Oldest loaded message:",
            oldestMinutes
        );

        // STOP AT 3AM
        if (
            oldestMinutes !== null &&
            oldestMinutes <= TARGET_MINUTES
        ) {

            console.log(
                "Reached 3AM PST"
            );

            reachedTarget = true;

            break;
        }

        // FORCE SCROLL TO TOP
        scrollContainer.scrollTop = 0;

        console.log(
            "Scrolling upward..."
        );

        // WAIT FOR LAZY LOAD
        await new Promise(r =>
            setTimeout(r, 3000)
        );
    }

    console.log(
        "Backread complete"
    );
}

// WATCH FOR NEW LIVE MESSAGES
const observer =
    new MutationObserver(() => {

        extractMessages();
    });

async function initializeCollector() {

    console.log(
        "Waiting for Benzinga chat..."
    );

    let retries = 0;

    while (retries < 60) {

        const chatLoaded =
            document.querySelector(
                'li.str-chat__li'
            );

        if (chatLoaded) {

            console.log(
                "Chat detected. Starting collector..."
            );

            // START OBSERVER
            observer.observe(
                document.body,
                {
                    childList: true,
                    subtree: true
                }
            );

            // INITIAL EXTRACTION
            extractMessages();

            // START BACKREAD
            backreadTo3AM();

            return;
        }

        retries++;

        await new Promise(r =>
            setTimeout(r, 1000)
        );
    }

    console.error(
        "Chat failed to load after waiting."
    );
}

initializeCollector();