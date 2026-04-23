// ==UserScript==
// @name         Multiplayer Piano Optimizations [Edit]
// @namespace    https://tampermonkey.net/
// @version      1.0.2
// @description  Edit your messages in chat! (edited)
// @author       zackiboiz
// @match        *://*.multiplayerpiano.com/*
// @match        *://*.multiplayerpiano.net/*
// @match        *://*.multiplayerpiano.org/*
// @match        *://*.multiplayerpiano.dev/*
// @match        *://piano.mpp.community/*
// @match        *://mpp.7458.space/*
// @match        *://qmppv2.qwerty0301.repl.co/*
// @match        *://mpp.8448.space/*
// @match        *://mpp.hri7566.info/*
// @match        *://mpp.autoplayer.xyz/*
// @match        *://mpp.hyye.xyz/*
// @match        *://lmpp.hyye.xyz/*
// @match        *://mpp.hyye.tk/*
// @match        *://mpp.smp-meow.net/*
// @match        *://piano.ourworldofpixels.com/*
// @match        *://mpp.lapishusky.dev/*
// @match        *://staging-mpp.sad.ovh/*
// @match        *://mpp.terrium.net/*
// @match        *://mpp.yourfriend.lv/*
// @match        *://mpp.l3m0ncao.wtf/*
// @match        *://beta-mpp.csys64.com/*
// @match        *://fleetway-mpp.glitch.me/*
// @match        *://mpp.totalh.net/*
// @match        *://mpp.meowbin.com/*
// @match        *://mppfork.netlify.app/*
// @match        *://better.mppclone.me/*
// @match        *://*.openmpp.tk/*
// @match        *://*.mppkinda.com/*
// @match        *://*.augustberchelmann.com/piano/*
// @match        *://mpp.c30.life/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=multiplayerpiano.net
// @grant        GM_info
// @license      MIT
// @downloadURL  https://update.greasyfork.org/scripts/575160/Multiplayer%20Piano%20Optimizations%20%5BEdit%5D.user.js
// @updateURL    https://update.greasyfork.org/scripts/575160/Multiplayer%20Piano%20Optimizations%20%5BEdit%5D.meta.js
// ==/UserScript==

(async () => {
    const dl = GM_info.script.downloadURL || GM_info.script.updateURL || GM_info.script.homepageURL || "";
    const match = dl.match(/greasyfork\.org\/scripts\/(\d+)/);
    if (!match) {
        console.warn("Could not find Greasy Fork script ID in downloadURL/updateURL/homepageURL:", dl);
    } else {
        const scriptId = match[1];
        const localVersion = GM_info.script.version;
        const apiUrl = `https://greasyfork.org/scripts/${scriptId}.json?_=${Date.now()}`;

        fetch(apiUrl, {
            mode: "cors",
            headers: {
                Accept: "application/json"
            }
        }).then(r => {
            if (!r.ok) throw new Error("Failed to fetch Greasy Fork data.");
            return r.json();
        }).then(data => {
            const remoteVersion = data.version;
            if (compareVersions(localVersion, remoteVersion) < 0) {
                new MPP.Notification({
                    "m": "notification",
                    "duration": 15000,
                    "title": "Update Available",
                    "html": "<p>A new version of this script is available!</p>" +
                        `<p style='margin-top: 10px;'>Script: ${GM_info.script.name}</p>` +
                        `<p>Local: v${localVersion}</p>` +
                        `<p>Latest: v${remoteVersion}</p>` +
                        `<a href='https://greasyfork.org/scripts/${scriptId}' target='_blank' style='position: absolute; right: 0;bottom: 0; margin: 10px; font-size: 0.5rem;'>Open Greasy Fork to update?</a>`
                });
            }
        }).catch(err => console.error("Update check failed:", err));
    }

    function compareVersions(a, b) {
        const pa = a.split(".").map(n => parseInt(n, 10) || 0);
        const pb = b.split(".").map(n => parseInt(n, 10) || 0);
        const len = Math.max(pa.length, pb.length);
        for (let i = 0; i < len; i++) {
            if ((pa[i] || 0) < (pb[i] || 0)) return -1;
            if ((pa[i] || 0) > (pb[i] || 0)) return 1;
        }
        return 0;
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    await sleep(1000);


    const MAX_MESSAGE_LENGTH = 512;
    const DB_NAME = "mppo-edit";
    const DB_VERSION = 1;
    const STORE_NAME = "edits";

    let messages = [];
    let messageElems = [];
    let userId;
    let channelId;
    let editingId;
    let isEditing = false;
    let editingDmRecipient;
    let replyPart = {};

    function openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const os = db.createObjectStore(STORE_NAME, {
                        keyPath: "id"
                    });
                    os.createIndex("channelId", "channelId", {
                        unique: false
                    });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function saveEdit(id, channelId, message) {
        const db = await openDB();

        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put({
            id: id,
            channelId: channelId,
            message: message,
            timestamp: Date.now()
        });
        tx.oncomplete = () => db.close();
    }

    async function deleteEdit(id) {
        const db = await openDB();

        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => db.close();
    }

    async function getEdits(channelId) {
        const db = await openDB();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readonly");
            const idx = tx.objectStore(STORE_NAME).index("channelId");

            const req = idx.getAll(IDBKeyRange.only(channelId));
            req.onsuccess = () => {
                resolve(req.result || []);
                db.close();
            };
            req.onerror = () => {
                reject(req.error);
                db.close();
            };
        });
    }

    async function cleanupEdits(channelId, existingIds) {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, "readwrite");
        const idx = tx.objectStore(STORE_NAME).index("channelId");

        const req = idx.openCursor(IDBKeyRange.only(channelId));
        req.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                const rec = cursor.value;
                if (!existingIds.includes(rec.id)) cursor.delete();
                cursor.continue();
            }
        };
        tx.oncomplete = () => db.close();
    }

    function isConnected() {
        return !!(MPP && MPP.client && MPP.client.isConnected());
    }

    function check() {
        if (!isConnected()) return setTimeout(check, 200);
        run();
    }

    function run() {
        MPP.client.on("c", async (data) => {
            userId = MPP.client.participantId;
            channelId = MPP.client.channel._id;
            messages = data.c;

            const saved = await getEdits(channelId);
            for (const edit of saved) {
                const msg = messages.find(m => m.id === edit.id);
                if (!msg) continue;

                editMessage(msg.id, edit.message);
            }

            const existingIds = messages.map(m => m.id);
            await cleanupEdits(channelId, existingIds);

            scanAndAdd();
        });

        MPP.client.on("a", (data) => {
            messages.push(data);
            scanAndAdd();
        });
        MPP.client.on("dm", (data) => {
            messages.push(data);
            scanAndAdd();
        });
        MPP.client.on("custom", async (data) => {
            handleEdit(data);
        });

        function unsetEdit(id, clean = true) {
            if (clean) {
                MPP.chat.endDM();
                MPP.chat.cancelReply();
            }
            $(`#msg-${id}`).css({
                "background-color": "unset",
                border: "1px solid #00000000",
            });
        }
        function unsetAttrs() {
            editingId = null;
            isEditing = false;
            editingDmRecipient = null;
        }

        async function handleEdit(data) {
            const payload = data.data;
            if (payload?.m !== "edit") return;
            if (!payload.id || !payload.message ||
                typeof payload.id !== "string" ||
                typeof payload.message !== "string"
            ) return;

            const id = payload.id;
            const msg = messages.find(m => m.id === id);
            if (!msg ||
                (msg.m === "a" && msg.p?._id !== data.p) ||
                (msg.m === "dm" && msg.sender?._id !== data.p)
            ) return;
            if (payload.message.length > MAX_MESSAGE_LENGTH) return;

            editMessage(id, payload.message);
            saveEdit(id, channelId, payload.message);
        }

        function editMessage(id, message) {
            const msgElem = document.querySelector(`#msg-${id}`);
            if (!msgElem) return;
            const spanMsg = msgElem.querySelector("span.message");
            if (spanMsg) spanMsg.textContent = message;

            if (!msgElem.querySelector("span.edited")) {
                const edited = document.createElement("span");
                edited.className = "edited";
                edited.style.color = "#777";
                edited.style.fontSize = "0.75em";
                edited.textContent = "(edited)";
                msgElem.insertAdjacentElement("beforeend", edited);
            }

            messages.find(m => m.id === id).a = message;
        }

        async function scanAndAdd() {
            const ul = document.querySelector("div#chat > ul");
            if (!ul) return;

            for (const li of ul.querySelectorAll(":scope > li")) {
                if (!(li instanceof HTMLElement) || li.tagName !== "LI") continue;
                if (li.querySelector("span.edit") || li.className.includes("editable")) continue;

                li.classList.add("editable");
                const existingReply = li.querySelector("span.reply");
                if (existingReply) {
                    existingReply.addEventListener("click", function () {
                        unsetEdit(editingId, false);
                        unsetAttrs();
                    });
                }

                const id = li.id.split("-")[1];
                const msg = messages.find(m => m.id === id);

                if (!msg ||
                    (msg.m === "a" && msg.p?._id !== userId) ||
                    (msg.m === "dm" && msg.sender?._id !== userId)
                ) continue;

                const editButton = document.createElement("span");
                editButton.className = "edit";
                editButton.style.marginRight = "4px";
                editButton.style.paddingInline = "5px";
                editButton.style.backgroundColor = "#111";
                editButton.style.border = "1px solid #444";
                editButton.style.textShadow = "none";
                editButton.style.borderRadius = "2px";
                editButton.style.webkitBorderRadius = "2px";
                editButton.style.cursor = "pointer";
                editButton.textContent = "✎";

                if (existingReply) existingReply.insertAdjacentElement("afterend", editButton);
                else li.appendChild(editButton);

                messageElems.push(li);

                editButton.addEventListener("click", function () {
                    unsetEdit(editingId);

                    isEditing = true;
                    if (msg.m === "dm") editingDmRecipient = msg.recipient._id;
                    editingId = id;
                    setTimeout(() => {
                        $(`#msg-${id}`).css({
                            border: `1px solid ${msg?.m === "dm" ? msg.sender?.color : msg.p?.color}80`,
                            "background-color": `${msg?.m === "dm" ? msg.sender?.color : msg.p?.color}20`,
                        });
                    }, 100);
                    setTimeout(() => {
                        $("#chat-input").focus();
                    }, 100);

                    $("#chat-input")[0].placeholder = "Editing a message" + (msg.m === "dm" ? " in a DM" : "");
                    $("#chat-input")[0].value = msg.a;
                });
            }
        }

        const originalChatSend = MPP.chat.send;
        const originalStartDM = MPP.chat.startDM;
        MPP.chat.send = function (message) {
            if (!isEditing) return originalChatSend.apply(this, arguments);

            editMessage(editingId, message);

            MPP.client.sendArray([{
                m: "custom",
                data: {
                    m: "edit",
                    id: editingId,
                    message: message
                },
                target: editingDmRecipient ? {
                    mode: "id",
                    id: editingDmRecipient
                } : {
                    mode: "subscribed"
                }
            }]);

            saveEdit(editingId, channelId, message);
            unsetEdit(editingId);
            unsetAttrs();
        };
        MPP.chat.startDM = function () {
            unsetEdit(editingId, false);
            unsetAttrs();
            return originalStartDM.apply(this, arguments);
        }

        scanAndAdd();
        const triggerObserver = new MutationObserver(() => {
            scanAndAdd();
        });

        const chatRoot = document.querySelector("div#chat > ul");
        if (chatRoot) {
            triggerObserver.observe(chatRoot, {
                childList: true,
                subtree: true
            });
        }

        const chatInput = document.querySelector("#chat-input");
        chatInput.addEventListener("keydown", function (e) {
            if (e.keyCode === 13 && isEditing) {
                unsetEdit(editingId);
                unsetAttrs();
            }
        });
    }

    check();
})();