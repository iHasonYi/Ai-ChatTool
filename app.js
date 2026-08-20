const STORAGE_KEYS = {
    settings: "ai_chat_settings_v4",
    profiles: "ai_chat_api_profiles_v1",
    chats: "ai_chat_chats_v4",
    theme: "ai_chat_theme_v4",
    sidebarCollapsed: "nova_ai_sidebar_collapsed_v1"
};

const DEFAULT_SETTINGS = {
    systemPrompt: "You are a helpful AI assistant.",
    temperature: 0.7,
    maxTokens: 4096
};

const DEFAULT_PROFILE = {
    id: createId(),
    name: "Default API",
    apiUrl: "",
    apiKey: "",
    model: "",
    enabled: true,
    systemPrompt: DEFAULT_SETTINGS.systemPrompt,
    temperature: DEFAULT_SETTINGS.temperature,
    maxTokens: DEFAULT_SETTINGS.maxTokens,
    failedAttempts: 0,
    cooldownUntil: 0
};

const state = {
    settings: loadSettings(),
    profiles: loadProfiles(),
    chats: loadChats(),
    currentChatId: null,
    activeProfileId: null,
    attachments: [],
    isGenerating: false,
    abortController: null,
    theme: loadTheme(),
    autoScroll: true,
    scrollButton: null,
    currentRequestProfileId: null,
    lastRequestProfileId: null,
    lastRequestStatus: 0
};

const elements = {
    sidebar: document.getElementById("sidebar"),
    mobileOverlay: document.getElementById("mobileOverlay"),

    openSidebarButton: document.getElementById("openSidebarButton"),
    closeSidebarButton: document.getElementById("closeSidebarButton"),
    sidebarCollapseButton: document.getElementById("sidebarCollapseButton"),

    newChatButton: document.getElementById("newChatButton"),
    chatList: document.getElementById("chatList"),
    clearChatsButton: document.getElementById("clearChatsButton"),

    settingsButton: document.getElementById("settingsButton"),
    topSettingsButton: document.getElementById("topSettingsButton"),

    themeButton: document.getElementById("themeButton"),
    topThemeButton: document.getElementById("topThemeButton"),
    themeIcon: document.getElementById("themeIcon"),
    themeText: document.getElementById("themeText"),

    activeModel: document.getElementById("activeModel"),
    activeModelName: document.getElementById("activeModelName"),

    chatArea: document.getElementById("chatArea"),
    welcomeScreen: document.getElementById("welcomeScreen"),
    messages: document.getElementById("messages"),

    messageInput: document.getElementById("messageInput"),
    sendButton: document.getElementById("sendButton"),
    sendIcon: document.getElementById("sendIcon"),

    attachButton: document.getElementById("attachButton"),
    fileInput: document.getElementById("fileInput"),
    clearInputButton: document.getElementById("clearInputButton"),
    attachmentPreview: document.getElementById("attachmentPreview"),

    settingsModal: document.getElementById("settingsModal"),
    settingsOverlay: document.getElementById("settingsOverlay"),
    closeSettingsButton: document.getElementById("closeSettingsButton"),
    saveSettingsButton: document.getElementById("saveSettingsButton"),
    resetSettingsButton: document.getElementById("resetSettingsButton"),

    apiUrl: document.getElementById("apiUrl"),
    apiKey: document.getElementById("apiKey"),
    modelName: document.getElementById("modelName"),
    systemPrompt: document.getElementById("systemPrompt"),
    temperature: document.getElementById("temperature"),
    maxTokens: document.getElementById("maxTokens"),
    toggleApiKeyButton: document.getElementById("toggleApiKeyButton"),

    toastContainer: document.getElementById("toastContainer")
};

initialize();

function initialize() {
    migrateLegacySettings();

    normalizeProfiles();

    if (!state.activeProfileId) {
        const firstProfile = getUsableProfiles()[0];

        if (firstProfile) {
            state.activeProfileId = firstProfile.id;
        }
    }

    applyTheme(state.theme);
    populateSettingsForm();
    updateModelDisplay();
    renderChatList();

    if (state.chats.length > 0) {
        state.currentChatId = state.chats[0].id;
        renderCurrentChat();
    } else {
        createNewChat(false);
    }

    setupEventListeners();
    setupDragAndDrop();
    setupQuickActions();
    setupTextareaAutoResize();
    setupSmartConversationUX();
    injectProfileManager();
    renderProfileManager();
}

function setupEventListeners() {
    elements.newChatButton?.addEventListener("click", () => {
        createNewChat(true);
        closeSidebar();
    });

    elements.settingsButton?.addEventListener("click", openSettings);
    elements.topSettingsButton?.addEventListener("click", openSettings);

    elements.closeSettingsButton?.addEventListener("click", closeSettings);
    elements.settingsOverlay?.addEventListener("click", closeSettings);

    elements.saveSettingsButton?.addEventListener("click", saveSettings);
    elements.resetSettingsButton?.addEventListener("click", resetSettings);

    elements.toggleApiKeyButton?.addEventListener(
        "click",
        toggleApiKeyVisibility
    );

    elements.themeButton?.addEventListener("click", toggleTheme);
    elements.topThemeButton?.addEventListener("click", toggleTheme);

    elements.openSidebarButton?.addEventListener("click", openSidebar);
    elements.closeSidebarButton?.addEventListener("click", closeSidebar);
    elements.mobileOverlay?.addEventListener("click", closeSidebar);

    elements.activeModel?.addEventListener("click", openModelPicker);

    elements.attachButton?.addEventListener("click", () => {
        elements.fileInput?.click();
    });

    elements.fileInput?.addEventListener("change", handleFileInput);

    elements.clearInputButton?.addEventListener(
        "click",
        clearComposer
    );

    elements.sendButton?.addEventListener(
        "click",
        handleSendButton
    );

    elements.messageInput?.addEventListener("keydown", event => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            handleSendButton();
        }
    });

    elements.clearChatsButton?.addEventListener(
        "click",
        clearAllChats
    );

    document.addEventListener("paste", handlePaste);
}

function setupQuickActions() {
    document.querySelectorAll(".quick-card").forEach(button => {
        button.addEventListener("click", () => {
            const prompt = button.dataset.prompt || "";

            elements.messageInput.value = prompt;

            resizeTextarea();

            elements.messageInput.focus();
        });
    });
}

function setupTextareaAutoResize() {
    elements.messageInput.addEventListener(
        "input",
        resizeTextarea
    );
}

function setupSmartConversationUX() {
    if (!elements.chatArea || !elements.messageInput) {
        return;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "scroll-latest-button";
    button.innerHTML = '<span aria-hidden="true">↓</span><span>Latest</span>';
    button.setAttribute("aria-label", "Scroll to latest message");
    button.hidden = true;

    button.addEventListener("click", () => {
        state.autoScroll = true;
        scrollChatToBottom(true);
    });

    elements.chatArea.appendChild(button);
    state.scrollButton = button;

    elements.chatArea.addEventListener("scroll", updateSmartScrollState, { passive: true });

    elements.messageInput.addEventListener("input", saveCurrentDraft);

    restoreCurrentDraft();
    updateSmartScrollState();
}

function getDraftKey(chatId = state.currentChatId) {
    return chatId ? `nova_ai_draft_${chatId}` : null;
}

function saveCurrentDraft() {
    const key = getDraftKey();

    if (!key || !elements.messageInput) {
        return;
    }

    const value = elements.messageInput.value;

    try {
        if (value) {
            localStorage.setItem(key, value);
        } else {
            localStorage.removeItem(key);
        }
    } catch {
        // Draft persistence must never interrupt typing.
    }
}

function clearCurrentDraft(chatId = state.currentChatId) {
    const key = getDraftKey(chatId);

    if (!key) {
        return;
    }

    try {
        localStorage.removeItem(key);
    } catch {
        // Ignore storage failures.
    }
}

function restoreCurrentDraft() {
    if (!elements.messageInput) {
        return;
    }

    const key = getDraftKey();
    let draft = "";

    if (key) {
        try {
            draft = localStorage.getItem(key) || "";
        } catch {
            draft = "";
        }
    }

    elements.messageInput.value = draft;
    resizeTextarea();
}

function updateSmartScrollState() {
    if (!elements.chatArea) {
        return;
    }

    const distanceFromBottom =
        elements.chatArea.scrollHeight -
        elements.chatArea.scrollTop -
        elements.chatArea.clientHeight;

    const nearBottom = distanceFromBottom < 120;

    if (nearBottom) {
        state.autoScroll = true;
    } else if (elements.chatArea.scrollHeight > elements.chatArea.clientHeight + 20) {
        state.autoScroll = false;
    }

    if (state.scrollButton) {
        state.scrollButton.hidden = nearBottom;
    }
}

function resizeTextarea() {
    const textarea = elements.messageInput;

    textarea.style.height = "auto";

    textarea.style.height =
        `${Math.min(textarea.scrollHeight, 180)}px`;
}

function setupDragAndDrop() {
    const composer = document.querySelector(".composer");

    if (!composer) {
        return;
    }

    ["dragenter", "dragover"].forEach(eventName => {
        composer.addEventListener(eventName, event => {
            event.preventDefault();

            composer.classList.add("dragging");
        });
    });

    ["dragleave", "drop"].forEach(eventName => {
        composer.addEventListener(eventName, event => {
            event.preventDefault();

            composer.classList.remove("dragging");
        });
    });

    composer.addEventListener("drop", event => {
        const files =
            Array.from(
                event.dataTransfer?.files || []
            );

        if (files.length > 0) {
            addFiles(files);
        }
    });
}

function handleFileInput(event) {
    const files =
        Array.from(event.target.files || []);

    if (files.length > 0) {
        addFiles(files);
    }

    elements.fileInput.value = "";
}

async function handlePaste(event) {
    const clipboardItems =
        Array.from(
            event.clipboardData?.items || []
        );

    const imageFiles =
        clipboardItems
            .filter(item =>
                item.kind === "file" &&
                item.type.startsWith("image/")
            )
            .map(item => item.getAsFile())
            .filter(Boolean);

    if (imageFiles.length > 0) {
        await addFiles(imageFiles);
    }
}

async function addFiles(files) {
    const MAX_FILE_SIZE = 25 * 1024 * 1024;

    for (const file of files) {
        if (file.size > MAX_FILE_SIZE) {
            showToast(
                `File too large: ${file.name}`
            );

            continue;
        }

        const duplicate =
            state.attachments.some(item =>
                item.name === file.name &&
                item.size === file.size &&
                item.type === file.type
            );

        if (duplicate) {
            continue;
        }

        try {
            const attachment =
                await prepareAttachment(file);

            state.attachments.push(attachment);
        } catch {
            showToast(
                `Could not read file: ${file.name}`
            );
        }
    }

    renderAttachments();
}

async function prepareAttachment(file) {
    const isImage =
        file.type.startsWith("image/");

    const isText =
        isTextFile(file);

    const isArchive =
        isArchiveFile(file);

    const attachment = {
        id: createId(),
        name: file.name,
        size: file.size,
        type:
            file.type ||
            "application/octet-stream",
        file,
        isImage,
        isText,
        isArchive,
        dataUrl: null,
        previewUrl: null,
        textContent: null
    };

    if (isImage) {
        attachment.previewUrl =
            URL.createObjectURL(file);

        attachment.dataUrl =
            await fileToDataUrl(file);
    } else if (isText) {
        attachment.textContent =
            await file.text();
    }

    return attachment;
}

function isTextFile(file) {
    const textExtensions = [
        ".txt",
        ".md",
        ".markdown",
        ".html",
        ".htm",
        ".css",
        ".js",
        ".jsx",
        ".ts",
        ".tsx",
        ".json",
        ".xml",
        ".csv",
        ".yaml",
        ".yml",
        ".py",
        ".java",
        ".c",
        ".cpp",
        ".h",
        ".hpp",
        ".cs",
        ".php",
        ".rb",
        ".go",
        ".rs",
        ".sql",
        ".sh",
        ".bat",
        ".ps1",
        ".ini",
        ".env",
        ".log"
    ];

    const name =
        file.name.toLowerCase();

    return (
        file.type.startsWith("text/") ||
        textExtensions.some(
            extension => name.endsWith(extension)
        )
    );
}

function isArchiveFile(file) {
    const name =
        file.name.toLowerCase();

    return (
        name.endsWith(".zip") ||
        name.endsWith(".rar") ||
        name.endsWith(".7z") ||
        name.endsWith(".tar") ||
        name.endsWith(".gz") ||
        name.endsWith(".bz2") ||
        name.endsWith(".xz")
    );
}

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader =
            new FileReader();

        reader.onload = () => {
            resolve(reader.result);
        };

        reader.onerror = reject;

        reader.readAsDataURL(file);
    });
}

function renderAttachments() {
    elements.attachmentPreview.innerHTML = "";

    state.attachments.forEach(attachment => {
        const item =
            document.createElement("div");

        item.className =
            "attachment-item";

        if (attachment.isImage) {
            const image =
                document.createElement("img");

            image.className =
                "attachment-preview-image";

            image.src =
                attachment.previewUrl ||
                attachment.dataUrl;

            image.alt =
                attachment.name;

            image.loading = "lazy";

            item.appendChild(image);
        } else {
            const icon =
                document.createElement("div");

            icon.className =
                "attachment-icon";

            icon.textContent =
                getFileIcon(attachment);

            item.appendChild(icon);
        }

        const info =
            document.createElement("div");

        info.className =
            "attachment-info";

        const name =
            document.createElement("div");

        name.className =
            "attachment-name";

        name.textContent =
            attachment.name;

        const size =
            document.createElement("div");

        size.className =
            "attachment-size";

        size.textContent =
            formatFileSize(attachment.size);

        info.appendChild(name);
        info.appendChild(size);

        const remove =
            document.createElement("button");

        remove.className =
            "remove-attachment";

        remove.type = "button";

        remove.textContent = "×";

        remove.title = "Remove";

        remove.addEventListener(
            "click",
            () => {
                removeAttachment(
                    attachment.id
                );
            }
        );

        item.appendChild(info);
        item.appendChild(remove);

        elements.attachmentPreview.appendChild(
            item
        );
    });
}

function removeAttachment(id) {
    const attachment =
        state.attachments.find(
            item => item.id === id
        );

    if (
        attachment?.previewUrl
    ) {
        URL.revokeObjectURL(
            attachment.previewUrl
        );
    }

    state.attachments =
        state.attachments.filter(
            item => item.id !== id
        );

    renderAttachments();
}

function getFileIcon(attachment) {
    if (attachment.isArchive) {
        return "ZIP";
    }

    const extension =
        attachment.name
            .split(".")
            .pop()
            .toUpperCase();

    if (!extension) {
        return "FILE";
    }

    return extension.slice(0, 4);
}

function formatFileSize(bytes) {
    if (!bytes) {
        return "0 B";
    }

    const units = [
        "B",
        "KB",
        "MB",
        "GB"
    ];

    const index =
        Math.min(
            Math.floor(
                Math.log(bytes) /
                Math.log(1024)
            ),
            units.length - 1
        );

    return `${(
        bytes /
        Math.pow(1024, index)
    ).toFixed(
        index === 0 ? 0 : 1
    )} ${units[index]}`;
}

function openModelPicker() {
    const existing = document.getElementById("modelPickerPopover");
    if (existing) {
        existing.remove();
        return;
    }

    const profiles = state.profiles.filter(profile => profile.enabled);
    const anchor = elements.activeModel;
    if (!anchor) return;

    const popover = document.createElement("div");
    popover.id = "modelPickerPopover";
    popover.className = "model-picker-popover";

    const active = getActiveProfile();
    const rows = profiles.length
        ? profiles.map(profile => {
            const status = getProfileStatusSafe(profile);
            const provider = inferProviderName(profile.apiUrl);
            const selected = profile.id === active?.id;
            return `
                <button class="model-picker-item ${selected ? "selected" : ""}" type="button" data-profile-id="${escapeHtml(profile.id)}">
                    <span class="model-picker-status ${status.key}"></span>
                    <span class="model-picker-main">
                        <strong>${escapeHtml(profile.model || "Unnamed model")}</strong>
                        <small>${escapeHtml(profile.name)} · ${escapeHtml(provider)}</small>
                    </span>
                    <span class="model-picker-state">${selected ? "✓" : escapeHtml(status.label)}</span>
                </button>
            `;
        }).join("")
        : `<div class="model-picker-empty">No enabled API profiles are configured.</div>`;

    popover.innerHTML = `
        <div class="model-picker-head">
            <div>
                <strong>Choose model</strong>
                <small>Switch the active API without opening Settings.</small>
            </div>
            <button type="button" class="model-picker-close" aria-label="Close">×</button>
        </div>
        <div class="model-picker-list">${rows}</div>
        <button type="button" class="model-picker-manage">Manage API Profiles</button>
    `;

    document.body.appendChild(popover);

    const rect = anchor.getBoundingClientRect();
    const width = Math.min(360, Math.max(300, rect.width + 100));
    popover.style.width = `${width}px`;
    popover.style.top = `${Math.min(window.innerHeight - 24, rect.bottom + 10)}px`;
    popover.style.left = `${Math.max(12, Math.min(window.innerWidth - width - 12, rect.left + rect.width / 2 - width / 2))}px`;

    popover.querySelectorAll("[data-profile-id]").forEach(button => {
        button.addEventListener("click", () => {
            selectProfile(button.dataset.profileId);
            popover.remove();
            showToast("Active model switched.");
        });
    });

    popover.querySelector(".model-picker-close")?.addEventListener("click", () => popover.remove());
    popover.querySelector(".model-picker-manage")?.addEventListener("click", () => {
        popover.remove();
        openControlCenter("profiles");
    });

    const dismiss = event => {
        if (!popover.contains(event.target) && !anchor.contains(event.target)) {
            popover.remove();
            document.removeEventListener("pointerdown", dismiss, true);
        }
    };
    requestAnimationFrame(() => document.addEventListener("pointerdown", dismiss, true));

    const reposition = () => {
        if (!document.body.contains(popover)) return;
        const next = anchor.getBoundingClientRect();
        popover.style.top = `${Math.min(window.innerHeight - 24, next.bottom + 10)}px`;
        popover.style.left = `${Math.max(12, Math.min(window.innerWidth - width - 12, next.left + next.width / 2 - width / 2))}px`;
    };
    window.addEventListener("resize", reposition, { once: true });
}

function getProfileStatusSafe(profile) {
    if (!profile?.enabled) return { key: "disabled", label: "Disabled" };
    if (profile.cooldownUntil && profile.cooldownUntil > Date.now()) return { key: "cooldown", label: "Cooldown" };
    if (Number(profile.failedAttempts) > 0) return { key: "failed", label: "Recovering" };
    if (!profile.apiUrl || !profile.model) return { key: "unconfigured", label: "Not configured" };
    return { key: "online", label: "Ready" };
}

function inferProviderName(apiUrl = "") {
    const value = String(apiUrl).toLowerCase();
    if (value.includes("openrouter")) return "OpenRouter";
    if (value.includes("api.openai.com")) return "OpenAI";
    if (value.includes("anthropic")) return "Anthropic";
    if (value.includes("generativelanguage")) return "Google";
    if (value.includes("ollama")) return "Ollama";
    if (value.includes("lmstudio") || value.includes("lm-studio")) return "LM Studio";
    return "Custom API";
}

function handleSendButton() {
    if (state.isGenerating) {
        stopGeneration();

        return;
    }

    sendMessage();
}

async function sendMessage() {
    const text =
        elements.messageInput.value.trim();

    if (
        !text &&
        state.attachments.length === 0
    ) {
        return;
    }

    const profile =
        getActiveProfile();

    if (!profile) {
        showToast(
            "Add an enabled API profile first."
        );

        openSettings();

        return;
    }

    if (!profile.apiUrl) {
        showToast(
            "Enter the API URL first."
        );

        openSettings();

        return;
    }

    if (!profile.model) {
        showToast(
            "Enter the model name first."
        );

        openSettings();

        return;
    }

    const chat =
        getCurrentChat();

    const userMessage = {
        id: createId(),
        role: "user",
        content: text,
        attachments:
            await serializeAttachmentsForChat(),
        timestamp: Date.now()
    };

    chat.messages.push(
        userMessage
    );

    updateChatTitle(
        chat,
        text ||
        getAttachmentTitle()
    );

    clearCurrentDraft();
    elements.messageInput.value = "";

    resizeTextarea();

    clearCurrentAttachments();

    saveChats();

    renderCurrentChat();

    renderChatList();

    await generateAssistantResponse(
        chat
    );
}

function getAttachmentTitle() {
    if (
        state.attachments.length === 0
    ) {
        return "";
    }

    return state.attachments[0].name;
}

async function generateAssistantResponse(chat, options = {}) {
    state.isGenerating = true;

    state.abortController =
        new AbortController();

    updateSendButton();

    const assistantMessage = {
        id: createId(),
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        profileId: null,
        model: null
    };

    chat.messages.push(
        assistantMessage
    );

    renderCurrentChat();

    const assistantElement =
        findMessageElement(
            assistantMessage.id
        );

    try {
        const result =
            await performApiRequest(
                chat,
                assistantMessage,
                assistantElement
            );

        if (result.profile) {
            assistantMessage.profileId =
                result.profile.id;

            assistantMessage.model =
                result.profile.model;

            state.activeProfileId =
                result.profile.id;

            saveProfiles();

            updateModelDisplay();
        }

        saveChats();

        renderChatList();
    } catch (error) {
        assistantMessage.profileId =
            assistantMessage.profileId ||
            state.currentRequestProfileId ||
            null;

        state.lastRequestProfileId =
            assistantMessage.profileId;

        if (
            error.name === "AbortError"
        ) {
            if (
                !assistantMessage.content
            ) {
                assistantMessage.content =
                    "Generation stopped.";
            }
        } else {
            assistantMessage.content =
                `**API Error**\n\n\`${escapeMarkdown(
                    error.message
                )}\``;

            showToast(
                "API request failed."
            );
        }

        updateAssistantElement(
            assistantMessage,
            assistantElement
        );

        saveChats();
    } finally {
        state.isGenerating = false;

        state.abortController = null;

        state.currentRequestProfileId =
            null;

        updateSendButton();
    }
}

async function performApiRequest(
    chat,
    assistantMessage,
    assistantElement
) {
    const profiles = getRequestProfiles();

    if (profiles.length === 0) {
        throw new Error(
            "No enabled API profiles are available."
        );
    }

    let lastError = new Error("All API profiles failed.");

    for (let index = 0; index < profiles.length; index++) {
        const profile = profiles[index];

        if (
            profile.cooldownUntil &&
            profile.cooldownUntil > Date.now()
        ) {
            continue;
        }

        state.currentRequestProfileId = profile.id;
        assistantMessage.profileId = profile.id;
        const started = performance.now();

        try {
            const requestMessages = buildApiMessages(chat, profile);
            const response = await fetch(profile.apiUrl, {
                method: "POST",
                headers: buildHeaders(profile),
                body: JSON.stringify(
                    buildRequestBody(profile, requestMessages)
                ),
                signal: state.abortController.signal
            });

            const duration = performance.now() - started;
            assistantMessage.durationMs = duration;
            state.lastRequestProfileId = profile.id;
            state.lastRequestStatus = response.status;

            if (!response.ok) {
                const errorText = await safeReadResponseText(response);
                const error = createApiError(
                    response.status,
                    errorText
                );

                lastError = error;

                if (shouldFailover(response.status)) {
                    markProfileFailure(profile, response.status);
                    logApiEvent(
                        "failover-attempt",
                        profile,
                        response.status,
                        duration,
                        error.message
                    );
                    continue;
                }

                throw error;
            }

            resetProfileFailure(profile);

            try {
                await readStreamingResponse(
                    response,
                    assistantMessage,
                    assistantElement
                );
            } catch (error) {
                if (error.name === "AbortError") {
                    throw error;
                }

                lastError = error;
                assistantMessage.content = "";
                updateAssistantElement(
                    assistantMessage,
                    assistantElement
                );

                if (error.retryable || error.status) {
                    markProfileFailure(profile, error.status || 0);
                    logApiEvent(
                        "failover-stream",
                        profile,
                        error.status || 0,
                        performance.now() - started,
                        error.message
                    );
                    continue;
                }

                throw error;
            }

            assistantMessage.profileId = profile.id;
            assistantMessage.model = profile.model;
            assistantMessage.durationMs = performance.now() - started;
            state.lastRequestProfileId = profile.id;
            state.lastRequestStatus = response.status;
            profile.lastLatency = assistantMessage.durationMs;
            profile.lastSuccessAt = Date.now();
            saveProfiles();
            logApiEvent(
                "success",
                profile,
                response.status,
                assistantMessage.durationMs,
                "Generation succeeded."
            );

            return { profile };
        } catch (error) {
            if (error.name === "AbortError") {
                throw error;
            }

            lastError = error;
            state.lastRequestProfileId = profile.id;
            state.lastRequestStatus = error.status || 0;

            const retryableNetworkError =
                error instanceof TypeError ||
                error.name === "TypeError" ||
                error.retryable === true;

            if (
                retryableNetworkError ||
                (error.status && shouldFailover(error.status))
            ) {
                markProfileFailure(profile, error.status || 0);
                logApiEvent(
                    "failover-attempt",
                    profile,
                    error.status || 0,
                    performance.now() - started,
                    error.message
                );
                continue;
            }

            throw error;
        }
    }

    throw new Error(
        `All API profiles failed. Last error: ${lastError.message}`
    );
}

function buildRequestBody(
    profile,
    messages
) {
    const body = {
        model: profile.model,
        messages,
        stream: true
    };

    const temperature =
        Number(
            profile.temperature
        );

    const maxTokens =
        Number(
            profile.maxTokens
        );

    if (
        Number.isFinite(temperature)
    ) {
        body.temperature =
            clamp(
                temperature,
                0,
                2
            );
    }

    if (
        Number.isFinite(maxTokens) &&
        maxTokens > 0
    ) {
        body.max_tokens =
            Math.floor(maxTokens);
    }

    return body;
}

function buildHeaders(profile) {
    const headers = {
        "Content-Type":
            "application/json"
    };

    if (profile.apiKey) {
        headers.Authorization =
            `Bearer ${profile.apiKey}`;
    }

    return headers;
}

function createApiError(
    status,
    message
) {
    const error =
        new Error(
            `API request failed (${status}): ${message || "Unknown error"}`
        );

    error.status = status;

    return error;
}

function shouldFailover(status) {
    return [
        401,
        403,
        408,
        409,
        429,
        500,
        502,
        503,
        504
    ].includes(status);
}

function markProfileFailure(
    profile,
    status
) {
    profile.failedAttempts =
        Number(
            profile.failedAttempts
        ) + 1;

    if (status === 429) {
        profile.cooldownUntil =
            Date.now() +
            getCooldownDuration(
                profile.failedAttempts
            );
    } else if (
        status === 401 ||
        status === 403
    ) {
        profile.cooldownUntil =
            Date.now() +
            30000;
    } else {
        profile.cooldownUntil =
            Date.now() +
            5000;
    }

    saveProfiles();
}

function resetProfileFailure(
    profile
) {
    profile.failedAttempts = 0;

    profile.cooldownUntil = 0;

    saveProfiles();
}

function getCooldownDuration(
    attempts
) {
    const base =
        30000;

    const maximum =
        15 * 60 * 1000;

    return Math.min(
        base *
            Math.pow(
                2,
                Math.max(
                    attempts - 1,
                    0
                )
            ),
        maximum
    );
}

function getRequestProfiles() {
    const enabled =
        state.profiles.filter(
            profile =>
                profile.enabled &&
                profile.apiUrl &&
                profile.model
        );

    if (
        enabled.length === 0
    ) {
        return [];
    }

    const active =
        getActiveProfile();

    const ordered = [];

    if (active) {
        ordered.push(active);
    }

    enabled.forEach(profile => {
        if (
            !active ||
            profile.id !== active.id
        ) {
            ordered.push(profile);
        }
    });

    return ordered;
}

async function safeReadResponseText(
    response
) {
    try {
        return await response.text();
    } catch {
        return "";
    }
}

function buildApiMessages(
    chat,
    profile
) {
    const messages = [];

    if (
        profile.systemPrompt &&
        profile.systemPrompt.trim()
    ) {
        messages.push({
            role: "system",
            content:
                profile.systemPrompt.trim()
        });
    }

    for (
        const message of chat.messages
    ) {
        if (
            message.role === "assistant"
        ) {
            messages.push({
                role: "assistant",
                content:
                    message.content
            });

            continue;
        }

        messages.push(
            buildUserApiMessage(
                message
            )
        );
    }

    return messages;
}

function buildUserApiMessage(
    message
) {
    const attachments =
        message.attachments || [];

    if (
        attachments.length === 0
    ) {
        return {
            role: "user",
            content:
                message.content || ""
        };
    }

    const content = [];

    if (message.content) {
        content.push({
            type: "text",
            text: message.content
        });
    }

    for (
        const attachment of attachments
    ) {
        if (
            attachment.isImage &&
            attachment.dataUrl
        ) {
            content.push({
                type: "image_url",
                image_url: {
                    url:
                        attachment.dataUrl
                }
            });

            continue;
        }

        if (
            attachment.isText &&
            attachment.textContent !== null
        ) {
            content.push({
                type: "text",
                text:
                    `File: ${attachment.name}\n\n` +
                    attachment.textContent
            });

            continue;
        }

        if (
            attachment.isArchive
        ) {
            content.push({
                type: "text",
                text:
                    `Archive attached: ${attachment.name}\n` +
                    `MIME type: ${attachment.type}\n` +
                    `The archive is attached to the conversation, but this browser client does not extract archive contents automatically.`
            });

            continue;
        }

        content.push({
            type: "text",
            text:
                `File attached: ${attachment.name}\n` +
                `MIME type: ${attachment.type}\n` +
                `File size: ${formatFileSize(
                    attachment.size
                )}`
        });
    }

    return {
        role: "user",
        content
    };
}

async function readStreamingResponse(
    response,
    assistantMessage,
    assistantElement
) {
    if (!response.body) {
        throw new Error(
            "The API returned an empty response body."
        );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let sawDone = false;

    const processLine = rawLine => {
        const line = rawLine.trim();

        if (!line || line.startsWith(":")) {
            return;
        }

        if (line === "data: [DONE]") {
            sawDone = true;
            return;
        }

        if (!line.startsWith("data:")) {
            return;
        }

        const payload = line.slice(5).trim();
        if (!payload) {
            return;
        }

        let data;
        try {
            data = JSON.parse(payload);
        } catch (error) {
            const parseError = new Error("The API returned an invalid streaming chunk.");
            parseError.cause = error;
            parseError.retryable = true;
            throw parseError;
        }

        if (data?.error) {
            const message =
                data.error.message ||
                data.error.detail ||
                "The API returned a streaming error.";
            const streamError = new Error(String(message));
            streamError.status = Number(data.error.code || data.error.status || 0) || 0;
            streamError.retryable = true;
            throw streamError;
        }

        if (data?.usage) {
            assistantMessage.usage = data.usage;
        }

        const delta = extractStreamingDelta(data);

        if (typeof delta === "string" && delta) {
            assistantMessage.content += delta;
            updateAssistantElement(
                assistantMessage,
                assistantElement
            );
            scrollChatToBottom();
        }
    };

    while (true) {
        const { value, done } = await reader.read();

        if (done) {
            break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";

        for (const line of lines) {
            processLine(line);
        }
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
        const remainingLines = buffer.split(/\r?\n/);
        for (const line of remainingLines) {
            processLine(line);
        }
    }

    if (!sawDone && !assistantMessage.content && !assistantMessage.usage) {
        const emptyError = new Error("The API stream ended without a response.");
        emptyError.retryable = true;
        throw emptyError;
    }
}

function extractStreamingDelta(
    data
) {
    const choice =
        data?.choices?.[0];

    if (!choice) {
        return "";
    }

    const delta =
        choice.delta;

    if (
        typeof delta?.content ===
        "string"
    ) {
        return delta.content;
    }

    if (
        Array.isArray(
            delta?.content
        )
    ) {
        return delta.content
            .map(part =>
                typeof part ===
                    "string"
                    ? part
                    : part?.text || ""
            )
            .join("");
    }

    if (
        typeof choice.message
            ?.content ===
        "string"
    ) {
        return choice.message.content;
    }

    return "";
}

function updateAssistantElement(
    message,
    element
) {
    if (!element) {
        return;
    }

    const contentElement =
        element.querySelector(
            ".message-content"
        );

    if (!contentElement) {
        return;
    }

    contentElement.innerHTML =
        renderMarkdown(
            message.content || ""
        );

    enhanceCodeBlocks(
        contentElement
    );

    enhanceGeneratedImages(
        contentElement
    );
}

function renderCurrentChat() {
    const chat =
        getCurrentChat();

    if (!chat) {
        return;
    }

    elements.messages.innerHTML = "";

    const hasMessages =
        chat.messages.length > 0;

    elements.welcomeScreen.style.display =
        hasMessages
            ? "none"
            : "block";

    for (
        const message of chat.messages
    ) {
        elements.messages.appendChild(
            createMessageElement(
                message
            )
        );
    }

    restoreCurrentDraft();
    state.autoScroll = true;

    requestAnimationFrame(() => {
        scrollChatToBottom(true);
    });
}

function createMessageElement(
    message
) {
    const wrapper =
        document.createElement(
            "article"
        );

    wrapper.className =
        `message ${message.role}`;

    wrapper.dataset.messageId =
        message.id;

    const avatar =
        document.createElement("div");

    avatar.className =
        "message-avatar";

    avatar.textContent =
        message.role === "user"
            ? "You"
            : "AI";

    const body =
        document.createElement("div");

    body.className =
        "message-body";

    const content =
        document.createElement("div");

    content.className =
        "message-content";

    if (
        message.role === "assistant"
    ) {
        content.innerHTML =
            renderMarkdown(
                message.content || ""
            );

        enhanceCodeBlocks(
            content
        );

        enhanceGeneratedImages(
            content
        );
    } else {
        renderUserMessage(
            content,
            message
        );
    }

    const meta =
        document.createElement("div");

    meta.className =
        "message-meta";

    meta.textContent =
        message.role === "user"
            ? "You"
            : "AI";

    body.appendChild(content);

    body.appendChild(meta);

    if (
        message.role === "assistant"
    ) {
        const actions =
            document.createElement(
                "div"
            );

        actions.className =
            "message-actions";

        const copyButton =
            document.createElement(
                "button"
            );

        copyButton.className =
            "message-action";

        copyButton.type =
            "button";

        copyButton.textContent =
            "Copy";

        copyButton.addEventListener(
            "click",
            () => {
                copyText(
                    message.content ||
                        ""
                );
            }
        );

        actions.appendChild(
            copyButton
        );

        body.appendChild(
            actions
        );
    }

    wrapper.appendChild(
        avatar
    );

    wrapper.appendChild(
        body
    );

    return wrapper;
}

function renderUserMessage(
    container,
    message
) {
    if (message.content) {
        const text =
            document.createElement(
                "div"
            );

        text.textContent =
            message.content;

        container.appendChild(
            text
        );
    }

    const attachments =
        message.attachments || [];

    if (
        attachments.length === 0
    ) {
        return;
    }

    const attachmentContainer =
        document.createElement(
            "div"
        );

    attachmentContainer.className =
        "message-attachments";

    attachments.forEach(
        attachment => {
            const item =
                document.createElement(
                    "div"
                );

            item.className =
                attachment.isImage
                    ? "message-image-card"
                    : "message-file-card";

            if (
                attachment.isImage &&
                attachment.dataUrl
            ) {
                const image =
                    document.createElement(
                        "img"
                    );

                image.src =
                    attachment.dataUrl;

                image.alt =
                    attachment.name;

                image.className =
                    "message-image";

                image.loading =
                    "lazy";

                image.addEventListener(
                    "click",
                    () => {
                        openImagePreview(
                            attachment.dataUrl,
                            attachment.name
                        );
                    }
                );

                item.appendChild(
                    image
                );

                const imageName =
                    document.createElement(
                        "div"
                    );

                imageName.className =
                    "message-image-name";

                imageName.textContent =
                    attachment.name;

                item.appendChild(
                    imageName
                );
            } else {
                const icon =
                    document.createElement(
                        "div"
                    );

                icon.className =
                    "message-file-icon";

                icon.textContent =
                    getFileIcon(
                        attachment
                    );

                const info =
                    document.createElement(
                        "div"
                    );

                info.className =
                    "message-file-info";

                const name =
                    document.createElement(
                        "strong"
                    );

                name.textContent =
                    attachment.name;

                const size =
                    document.createElement(
                        "small"
                    );

                size.textContent =
                    formatFileSize(
                        attachment.size
                    );

                info.appendChild(
                    name
                );

                info.appendChild(
                    size
                );

                item.appendChild(
                    icon
                );

                item.appendChild(
                    info
                );
            }

            attachmentContainer.appendChild(
                item
            );
        }
    );

    container.appendChild(
        attachmentContainer
    );
}

function openImagePreview(
    src,
    name
) {
    const existing =
        document.querySelector(
            ".image-lightbox"
        );

    if (existing) {
        existing.remove();
    }

    const overlay =
        document.createElement(
            "div"
        );

    overlay.className =
        "image-lightbox";

    overlay.setAttribute(
        "role",
        "dialog"
    );

    overlay.setAttribute(
        "aria-modal",
        "true"
    );

    const content =
        document.createElement(
            "div"
        );

    content.className =
        "image-lightbox-content";

    const toolbar =
        document.createElement(
            "div"
        );

    toolbar.className =
        "image-lightbox-toolbar";

    const createButton = (
        label,
        action,
        title
    ) => {
        const button =
            document.createElement(
                "button"
            );

        button.type = "button";
        button.className =
            "image-lightbox-tool";
        button.textContent = label;
        button.title = title;
        button.setAttribute(
            "aria-label",
            title
        );

        button.addEventListener(
            "click",
            event => {
                event.stopPropagation();
                action();
            }
        );

        return button;
    };

    const image =
        document.createElement(
            "img"
        );

    image.src = src;
    image.alt = name || "Generated image";
    image.className =
        "image-lightbox-image";
    image.draggable = false;

    let scale = 1;

    const applyScale = () => {
        image.style.transform =
            `scale(${scale})`;
        image.classList.toggle(
            "is-zoomed",
            scale > 1
        );
    };

    const zoomIn = () => {
        scale = Math.min(4, scale + 0.25);
        applyScale();
    };

    const zoomOut = () => {
        scale = Math.max(0.5, scale - 0.25);
        applyScale();
    };

    const reset = () => {
        scale = 1;
        applyScale();
    };

    const close = () => {
        overlay.remove();
        document.body.classList.remove(
            "image-lightbox-open"
        );
        document.removeEventListener(
            "keydown",
            keyHandler
        );
    };

    const keyHandler = event => {
        if (event.key === "Escape") {
            close();
        } else if (event.key === "+" || event.key === "=") {
            zoomIn();
        } else if (event.key === "-") {
            zoomOut();
        } else if (event.key === "0") {
            reset();
        }
    };

    toolbar.appendChild(
        createButton(
            "−",
            zoomOut,
            "Zoom out"
        )
    );

    toolbar.appendChild(
        createButton(
            "+",
            zoomIn,
            "Zoom in"
        )
    );

    toolbar.appendChild(
        createButton(
            "↺",
            reset,
            "Reset zoom"
        )
    );

    toolbar.appendChild(
        createButton(
            "×",
            close,
            "Close"
        )
    );

    const title =
        document.createElement(
            "div"
        );

    title.className =
        "image-lightbox-title";

    title.textContent =
        name || "Generated image";

    content.appendChild(
        toolbar
    );

    content.appendChild(
        image
    );

    content.appendChild(
        title
    );

    overlay.appendChild(
        content
    );

    overlay.addEventListener(
        "click",
        event => {
            if (event.target === overlay) {
                close();
            }
        }
    );

    image.addEventListener(
        "click",
        event => {
            event.stopPropagation();
            zoomIn();
        }
    );

    image.addEventListener(
        "wheel",
        event => {
            event.preventDefault();
            if (event.deltaY < 0) {
                zoomIn();
            } else {
                zoomOut();
            }
        },
        { passive: false }
    );

    document.body.appendChild(
        overlay
    );

    document.body.classList.add(
        "image-lightbox-open"
    );

    document.addEventListener(
        "keydown",
        keyHandler
    );
}

function enhanceGeneratedImages(
    container
) {
    if (!container) {
        return;
    }

    const images =
        container.querySelectorAll(
            "img"
        );

    images.forEach(image => {
        if (
            image.closest("pre") ||
            image.dataset.lightboxReady === "true"
        ) {
            return;
        }

        image.dataset.lightboxReady =
            "true";

        image.classList.add(
            "generated-image"
        );

        image.setAttribute(
            "tabindex",
            "0"
        );

        image.setAttribute(
            "role",
            "button"
        );

        image.setAttribute(
            "aria-label",
            "Open image in full screen"
        );

        image.addEventListener(
            "click",
            event => {
                event.preventDefault();
                event.stopPropagation();

                openImagePreview(
                    image.currentSrc || image.src,
                    image.alt || "Generated image"
                );
            }
        );

        image.addEventListener(
            "keydown",
            event => {
                if (
                    event.key === "Enter" ||
                    event.key === " "
                ) {
                    event.preventDefault();
                    openImagePreview(
                        image.currentSrc || image.src,
                        image.alt || "Generated image"
                    );
                }
            }
        );
    });
}

function renderMarkdown(
    markdown
) {
    if (!markdown) {
        return `
            <div class="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
            </div>
        `;
    }

    marked.setOptions({
        breaks: true,
        gfm: true
    });

    const rawHtml =
        marked.parse(
            markdown
        );

    return DOMPurify.sanitize(
        rawHtml
    );
}

function enhanceCodeBlocks(
    container
) {
    const preElements =
        container.querySelectorAll(
            "pre"
        );

    preElements.forEach(pre => {
        if (
            pre.parentElement?.classList.contains(
                "code-block"
            )
        ) {
            return;
        }

        const code =
            pre.querySelector(
                "code"
            );

        if (!code) {
            return;
        }

        const className =
            Array.from(
                code.classList
            ).find(
                name =>
                    name.startsWith(
                        "language-"
                    )
            );

        const language =
            className
                ? className.replace(
                    "language-",
                    ""
                )
                : "code";

        const codeText =
            code.textContent || "";

        const wrapper =
            document.createElement(
                "div"
            );

        wrapper.className =
            "code-block";

        const header =
            document.createElement(
                "div"
            );

        header.className =
            "code-header";

        const languageLabel =
            document.createElement(
                "span"
            );

        languageLabel.className =
            "code-language";

        languageLabel.textContent =
            language.toUpperCase();

        const copyButton =
            document.createElement(
                "button"
            );

        copyButton.className =
            "copy-code-button";

        copyButton.type =
            "button";

        copyButton.textContent =
            "Copy";

        copyButton.addEventListener(
            "click",
            async () => {
                await copyText(
                    codeText
                );

                copyButton.textContent =
                    "Copied";

                setTimeout(
                    () => {
                        copyButton.textContent =
                            "Copy";
                    },
                    1200
                );
            }
        );

        header.appendChild(
            languageLabel
        );

        header.appendChild(
            copyButton
        );

        const preWrapper =
            document.createElement(
                "pre"
            );

        const newCode =
            document.createElement(
                "code"
            );

        newCode.textContent =
            codeText;

        preWrapper.appendChild(
            newCode
        );

        wrapper.appendChild(
            header
        );

        wrapper.appendChild(
            preWrapper
        );

        pre.replaceWith(
            wrapper
        );
    });
}

function findMessageElement(
    messageId
) {
    return elements.messages.querySelector(
        `[data-message-id="${messageId}"]`
    );
}

function scrollChatToBottom(force = false) {
    if (!elements.chatArea) {
        return;
    }

    if (!force && state.autoScroll === false) {
        updateSmartScrollState();
        return;
    }

    elements.chatArea.scrollTop =
        elements.chatArea.scrollHeight;

    state.autoScroll = true;
    updateSmartScrollState();
}

function stopGeneration() {
    if (
        state.abortController
    ) {
        state.abortController.abort();
    }
}

function updateSendButton() {
    if (
        state.isGenerating
    ) {
        elements.sendButton.classList.add(
            "stop"
        );

        elements.sendIcon.textContent =
            "■";
    } else {
        elements.sendButton.classList.remove(
            "stop"
        );

        elements.sendIcon.textContent =
            "↑";
    }
}

function createNewChat(
    render = true
) {
    const chat = {
        id: createId(),
        title: "محادثة جديدة",
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    state.chats.unshift(
        chat
    );

    state.currentChatId =
        chat.id;

    clearCurrentDraft(chat.id);
    saveChats();

    if (render) {
        renderCurrentChat();
        renderChatList();
    }
}

function getCurrentChat() {
    return state.chats.find(
        chat =>
            chat.id ===
            state.currentChatId
    );
}

function updateChatTitle(
    chat,
    text
) {
    if (!chat || !text) {
        return;
    }

    if (
        chat.title !==
        "محادثة جديدة"
    ) {
        return;
    }

    const cleanText =
        text
            .replace(/\s+/g, " ")
            .trim();

    chat.title =
        cleanText.length > 35
            ? `${cleanText.slice(
                0,
                35
            )}...`
            : cleanText;

    chat.updatedAt =
        Date.now();
}

function renderChatList() {
    elements.chatList.innerHTML = "";

    const sortedChats = [...state.chats].sort((a, b) => {
        if (!!b.pinned !== !!a.pinned) {
            return b.pinned ? 1 : -1;
        }

        return (b.updatedAt || 0) - (a.updatedAt || 0);
    });

    if (sortedChats.length === 0) {
        const empty = document.createElement("div");
        empty.className = "chat-empty";
        empty.textContent = "لا توجد محادثات";
        elements.chatList.appendChild(empty);
        return;
    }

    sortedChats.forEach(chat => {
        const item = document.createElement("button");
        item.className = `chat-item ${
            chat.id === state.currentChatId ? "active" : ""
        }`;
        item.type = "button";
        item.dataset.chatId = chat.id;

        const icon = document.createElement("div");
        icon.className = "chat-item-icon";
        icon.textContent = "✦";

        const title = document.createElement("div");
        title.className = "chat-item-title";
        title.textContent = chat.title || "محادثة جديدة";

        item.appendChild(icon);
        item.appendChild(title);

        item.addEventListener("click", () => {
            state.currentChatId = chat.id;
            renderChatList();
            renderCurrentChat();
            closeSidebar();
        });

        elements.chatList.appendChild(item);
    });
}

function clearAllChats() {
    if (
        state.chats.length === 0
    ) {
        return;
    }

    const confirmed =
        window.confirm(
            "هل تريد حذف جميع المحادثات؟"
        );

    if (!confirmed) {
        return;
    }

    state.chats = [];

    createNewChat(true);

    showToast(
        "تم حذف المحادثات."
    );
}

async function serializeAttachmentsForChat() {
    const serialized = [];

    for (
        const attachment of
            state.attachments
    ) {
        const data = {
            id: attachment.id,
            name: attachment.name,
            size: attachment.size,
            type: attachment.type,
            isImage: attachment.isImage,
            isText: attachment.isText,
            isArchive: attachment.isArchive,
            dataUrl: null,
            textContent:
                attachment.textContent
        };

        if (
            attachment.isImage &&
            attachment.dataUrl
        ) {
            const MAX_STORED_IMAGE_SIZE =
                1500000;

            if (
                attachment.dataUrl.length <=
                MAX_STORED_IMAGE_SIZE
            ) {
                data.dataUrl =
                    attachment.dataUrl;
            }
        }

        serialized.push(
            data
        );
    }

    return serialized;
}

function clearCurrentAttachments() {
    state.attachments.forEach(
        attachment => {
            if (
                attachment.previewUrl
            ) {
                URL.revokeObjectURL(
                    attachment.previewUrl
                );
            }
        }
    );

    state.attachments = [];

    renderAttachments();
}

function saveChats() {
    try {
        localStorage.setItem(
            STORAGE_KEYS.chats,
            JSON.stringify(
                state.chats
            )
        );
    } catch {
        showToast(
            "Could not save chat history. Storage may be full."
        );
    }
}

function loadChats() {
    try {
        const raw =
            localStorage.getItem(
                STORAGE_KEYS.chats
            );

        if (!raw) {
            return [];
        }

        const parsed =
            JSON.parse(raw);

        return Array.isArray(
            parsed
        )
            ? parsed
            : [];
    } catch {
        return [];
    }
}

function saveSettingsData() {
    localStorage.setItem(
        STORAGE_KEYS.settings,
        JSON.stringify(
            state.settings
        )
    );
}

function loadSettings() {
    try {
        const raw =
            localStorage.getItem(
                STORAGE_KEYS.settings
            );

        if (!raw) {
            return {
                ...DEFAULT_SETTINGS
            };
        }

        return {
            ...DEFAULT_SETTINGS,
            ...JSON.parse(raw)
        };
    } catch {
        return {
            ...DEFAULT_SETTINGS
        };
    }
}

function migrateLegacySettings() {
    const legacy =
        loadLegacySettings();

    if (
        state.profiles.length > 0
    ) {
        return;
    }

    if (
        legacy.apiUrl ||
        legacy.apiKey ||
        legacy.model
    ) {
        const profile = {
            ...DEFAULT_PROFILE,
            id: createId(),
            name: "Migrated API",
            apiUrl:
                legacy.apiUrl || "",
            apiKey:
                legacy.apiKey || "",
            model:
                legacy.model || "",
            enabled: true,
            systemPrompt:
                legacy.systemPrompt ||
                DEFAULT_SETTINGS.systemPrompt,
            temperature:
                Number(
                    legacy.temperature
                ) || 0.7,
            maxTokens:
                Number(
                    legacy.maxTokens
                ) || 4096
        };

        state.profiles = [
            profile
        ];

        state.activeProfileId =
            profile.id;

        saveProfiles();

        return;
    }

    const defaultProfile = {
        ...DEFAULT_PROFILE
    };

    state.profiles = [
        defaultProfile
    ];

    state.activeProfileId =
        defaultProfile.id;

    saveProfiles();
}

function loadLegacySettings() {
    const keys = [
        "ai_chat_settings_v3",
        "ai_chat_settings_v2",
        "ai_chat_settings"
    ];

    for (
        const key of keys
    ) {
        try {
            const raw =
                localStorage.getItem(
                    key
                );

            if (!raw) {
                continue;
            }

            const parsed =
                JSON.parse(raw);

            if (
                parsed &&
                typeof parsed ===
                    "object"
            ) {
                return parsed;
            }
        } catch {
            continue;
        }
    }

    return {};
}

function saveProfiles() {
    try {
        localStorage.setItem(
            STORAGE_KEYS.profiles,
            JSON.stringify(
                state.profiles
            )
        );
    } catch {
        showToast(
            "Could not save API profiles."
        );
    }
}

function loadProfiles() {
    try {
        const raw =
            localStorage.getItem(
                STORAGE_KEYS.profiles
            );

        if (!raw) {
            return [];
        }

        const parsed =
            JSON.parse(raw);

        return Array.isArray(
            parsed
        )
            ? parsed
            : [];
    } catch {
        return [];
    }
}

function normalizeProfiles() {
    state.profiles =
        state.profiles
            .filter(Boolean)
            .map(profile => ({
                ...DEFAULT_PROFILE,
                ...profile,
                id:
                    profile.id ||
                    createId(),
                name:
                    profile.name ||
                    "API Profile",
                enabled:
                    profile.enabled !== false,
                temperature:
                    Number(
                        profile.temperature
                    ) || 0.7,
                maxTokens:
                    Number(
                        profile.maxTokens
                    ) || 4096,
                failedAttempts:
                    Number(
                        profile.failedAttempts
                    ) || 0,
                cooldownUntil:
                    Number(
                        profile.cooldownUntil
                    ) || 0
            }));

    saveProfiles();
}

function getUsableProfiles() {
    return state.profiles.filter(
        profile =>
            profile.enabled
    );
}

function getActiveProfile() {
    return (
        state.profiles.find(
            profile =>
                profile.id ===
                state.activeProfileId
        ) ||
        getUsableProfiles()[0] ||
        null
    );
}

function getProfileById(id) {
    return state.profiles.find(
        profile =>
            profile.id === id
    );
}

function populateSettingsForm() {
    const profile =
        getActiveProfile();

    if (!profile) {
        return;
    }

    elements.apiUrl.value =
        profile.apiUrl || "";

    elements.apiKey.value =
        profile.apiKey || "";

    elements.modelName.value =
        profile.model || "";

    elements.systemPrompt.value =
        profile.systemPrompt ||
        DEFAULT_SETTINGS.systemPrompt;

    elements.temperature.value =
        profile.temperature;

    elements.maxTokens.value =
        profile.maxTokens;

    elements.toggleApiKeyButton.textContent =
        elements.apiKey.type ===
        "password"
            ? "عرض"
            : "إخفاء";
}

function openSettings() {
    populateSettingsForm();

    renderProfileManager();

    elements.settingsModal.classList.remove(
        "hidden"
    );
}

function closeSettings() {
    elements.settingsModal.classList.add(
        "hidden"
    );
}

function saveSettings() {
    let profile =
        getActiveProfile();

    if (!profile) {
        profile = {
            ...DEFAULT_PROFILE,
            id: createId()
        };

        state.profiles.push(
            profile
        );

        state.activeProfileId =
            profile.id;
    }

    profile.apiUrl =
        elements.apiUrl.value.trim();

    profile.apiKey =
        elements.apiKey.value.trim();

    profile.model =
        elements.modelName.value.trim();

    profile.systemPrompt =
        elements.systemPrompt.value.trim() ||
        DEFAULT_SETTINGS.systemPrompt;

    profile.temperature =
        clamp(
            Number(
                elements.temperature.value
            ) || 0.7,
            0,
            2
        );

    profile.maxTokens =
        Math.max(
            1,
            Number(
                elements.maxTokens.value
            ) || 4096
        );

    saveProfiles();

    saveSettingsData();

    updateModelDisplay();

    renderProfileManager();

    closeSettings();

    showToast(
        "تم حفظ الإعدادات."
    );
}

function resetSettings() {
    const confirmed =
        window.confirm(
            "هل تريد إعادة ضبط إعدادات هذا الـ API Profile؟"
        );

    if (!confirmed) {
        return;
    }

    const profile =
        getActiveProfile();

    if (!profile) {
        return;
    }

    profile.apiUrl = "";
    profile.apiKey = "";
    profile.model = "";
    profile.systemPrompt =
        DEFAULT_SETTINGS.systemPrompt;
    profile.temperature =
        DEFAULT_SETTINGS.temperature;
    profile.maxTokens =
        DEFAULT_SETTINGS.maxTokens;
    profile.failedAttempts = 0;
    profile.cooldownUntil = 0;

    saveProfiles();

    populateSettingsForm();

    updateModelDisplay();

    renderProfileManager();

    showToast(
        "تمت إعادة ضبط الـ Profile."
    );
}

function updateModelDisplay() {
    const profile =
        getActiveProfile();

    if (!profile) {
        elements.activeModelName.textContent =
            "No model selected";

        return;
    }

    elements.activeModelName.textContent =
        profile.model ||
        profile.name ||
        "No model selected";
}

function toggleApiKeyVisibility() {
    const isPassword =
        elements.apiKey.type ===
        "password";

    elements.apiKey.type =
        isPassword
            ? "text"
            : "password";

    elements.toggleApiKeyButton.textContent =
        isPassword
            ? "إخفاء"
            : "عرض";
}

function toggleTheme() {
    const nextTheme =
        state.theme === "dark"
            ? "light"
            : "dark";

    state.theme =
        nextTheme;

    saveTheme(
        nextTheme
    );

    applyTheme(
        nextTheme
    );
}

function applyTheme(theme) {
    document.documentElement.dataset.theme =
        theme;

    const isDark =
        theme === "dark";

    elements.themeIcon.textContent =
        isDark
            ? "☀"
            : "☾";

    elements.themeText.textContent =
        isDark
            ? "الوضع النهاري"
            : "الوضع الليلي";
}

function saveTheme(theme) {
    localStorage.setItem(
        STORAGE_KEYS.theme,
        theme
    );
}

function loadTheme() {
    const stored =
        localStorage.getItem(
            STORAGE_KEYS.theme
        );

    if (
        stored === "dark" ||
        stored === "light"
    ) {
        return stored;
    }

    return (
        window.matchMedia &&
        window.matchMedia(
            "(prefers-color-scheme: dark)"
        ).matches
    )
        ? "dark"
        : "light";
}

function clearComposer() {
    clearCurrentDraft();
    elements.messageInput.value =
        "";

    clearCurrentAttachments();

    resizeTextarea();

    elements.messageInput.focus();
}

function loadSidebarCollapsed() {
    return localStorage.getItem(STORAGE_KEYS.sidebarCollapsed) === "true";
}

function saveSidebarCollapsed(collapsed) {
    localStorage.setItem(STORAGE_KEYS.sidebarCollapsed, collapsed ? "true" : "false");
}

function updateSidebarCollapseUI(collapsed) {
    const sidebar = elements.sidebar;
    const button = elements.sidebarCollapseButton;
    if (!sidebar || !button) return;

    sidebar.classList.toggle("is-collapsed", collapsed);
    button.textContent = collapsed ? "›" : "‹";
    button.setAttribute("aria-expanded", collapsed ? "false" : "true");
    button.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
    button.setAttribute("title", collapsed ? "Expand sidebar" : "Collapse sidebar");

    document.querySelectorAll(".sidebar-nav-item").forEach(item => {
        const label = item.querySelector(":scope > span:not(.nav-icon)")?.textContent?.trim();
        if (label) item.setAttribute("title", collapsed ? label : "");
    });

    if (elements.newChatButton) {
        elements.newChatButton.setAttribute("title", collapsed ? "New chat" : "");
    }

    document.querySelectorAll(".sidebar-action").forEach(item => {
        const label = item.querySelector(".action-content strong")?.textContent?.trim();
        if (label) item.setAttribute("title", collapsed ? label : "");
    });
}

function toggleSidebarCollapsed() {
    if (window.matchMedia("(max-width: 900px)").matches) return;

    const next = !elements.sidebar?.classList.contains("is-collapsed");
    updateSidebarCollapseUI(next);
    saveSidebarCollapsed(next);
}

function setupSidebarCollapse() {
    const collapsed = loadSidebarCollapsed();
    const isMobile = window.matchMedia("(max-width: 900px)").matches;
    updateSidebarCollapseUI(isMobile ? false : collapsed);

    elements.sidebarCollapseButton?.addEventListener("click", toggleSidebarCollapsed);

    const mediaQuery = window.matchMedia("(max-width: 900px)");
    const syncResponsiveSidebar = event => {
        if (event.matches) {
            elements.sidebar?.classList.remove("is-collapsed");
        } else {
            updateSidebarCollapseUI(loadSidebarCollapsed());
        }
    };

    if (typeof mediaQuery.addEventListener === "function") {
        mediaQuery.addEventListener("change", syncResponsiveSidebar);
    } else {
        mediaQuery.addListener(syncResponsiveSidebar);
    }
}

function openSidebar() {
    elements.sidebar.classList.add(
        "open"
    );

    elements.mobileOverlay.classList.add(
        "show"
    );
}

function closeSidebar() {
    elements.sidebar.classList.remove(
        "open"
    );

    elements.mobileOverlay.classList.remove(
        "show"
    );
}

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(
            text
        );

        showToast(
            "تم النسخ."
        );
    } catch {
        const textarea =
            document.createElement(
                "textarea"
            );

        textarea.value =
            text;

        document.body.appendChild(
            textarea
        );

        textarea.select();

        document.execCommand(
            "copy"
        );

        textarea.remove();

        showToast(
            "تم النسخ."
        );
    }
}

function showToast(message) {
    const toast =
        document.createElement(
            "div"
        );

    toast.className =
        "toast";

    toast.textContent =
        message;

    elements.toastContainer.appendChild(
        toast
    );

    setTimeout(
        () => {
            toast.style.opacity =
                "0";

            toast.style.transform =
                "translateY(6px)";

            setTimeout(
                () => {
                    toast.remove();
                },
                180
            );
        },
        2200
    );
}

function clamp(
    value,
    min,
    max
) {
    return Math.min(
        Math.max(
            value,
            min
        ),
        max
    );
}

function escapeMarkdown(
    value
) {
    return String(value)
        .replace(
            /\\/g,
            "\\\\"
        )
        .replace(
            /`/g,
            "\\`"
        )
        .replace(
            /\*/g,
            "\\*"
        )
        .replace(
            /_/g,
            "\\_"
        )
        .replace(
            /\[/g,
            "\\["
        )
        .replace(
            /\]/g,
            "\\]"
        );
}

function createId() {
    if (
        typeof crypto !==
            "undefined" &&
        typeof crypto.randomUUID ===
            "function"
    ) {
        return crypto.randomUUID();
    }

    return (
        Date.now().toString(36) +
        Math.random()
            .toString(36)
            .slice(2)
    );
}

/* =========================================================
   MULTIPLE API PROFILE MANAGER
   ========================================================= */

function injectProfileManager() {
    const settingsContent =
        document.querySelector(
            ".settings-content"
        );

    if (!settingsContent) {
        return;
    }

    if (
        document.getElementById(
            "apiProfilesSection"
        )
    ) {
        return;
    }

    const section =
        document.createElement(
            "section"
        );

    section.id =
        "apiProfilesSection";

    section.className =
        "api-profiles-section";

    section.innerHTML = `
        <div class="settings-section-title">
            <span>API Profiles</span>
            <small>Multiple Keys</small>
        </div>

        <div class="profile-toolbar">
            <div class="profile-toolbar-info">
                <strong>API Profiles</strong>
                <span>
                    Save multiple API connections and switch between them.
                </span>
            </div>

            <button
                type="button"
                class="profile-add-button"
                id="addProfileButton"
            >
                + Add
            </button>
        </div>

        <div
            class="profile-list"
            id="profileList"
        ></div>

        <div class="profile-note">
            Automatic failover can switch to another enabled profile
            when the current provider returns a retryable error.
        </div>
    `;

    settingsContent.insertBefore(
        section,
        settingsContent.firstChild
    );

    const addButton =
        document.getElementById(
            "addProfileButton"
        );

    addButton?.addEventListener(
        "click",
        addNewProfile
    );
}

function renderProfileManager() {
    const list =
        document.getElementById(
            "profileList"
        );

    if (!list) {
        return;
    }

    list.innerHTML = "";

    if (
        state.profiles.length === 0
    ) {
        const empty =
            document.createElement(
                "div"
            );

        empty.className =
            "profile-empty";

        empty.textContent =
            "No API profiles yet.";

        list.appendChild(
            empty
        );

        return;
    }

    state.profiles.forEach(
        profile => {
            const card =
                document.createElement(
                    "div"
                );

            card.className =
                "api-profile-card";

            if (
                profile.id ===
                state.activeProfileId
            ) {
                card.classList.add(
                    "active"
                );
            }

            const top =
                document.createElement(
                    "div"
                );

            top.className =
                "api-profile-top";

            const radio =
                document.createElement(
                    "button"
                );

            radio.type =
                "button";

            radio.className =
                "profile-select-button";

            radio.title =
                "Use this profile";

            radio.textContent =
                profile.id ===
                state.activeProfileId
                    ? "✓"
                    : "";

            radio.addEventListener(
                "click",
                () => {
                    selectProfile(
                        profile.id
                    );
                }
            );

            const info =
                document.createElement(
                    "div"
                );

            info.className =
                "api-profile-info";

            const name =
                document.createElement(
                    "strong"
                );

            name.textContent =
                profile.name;

            const model =
                document.createElement(
                    "span"
                );

            model.textContent =
                profile.model ||
                "No model";

            info.appendChild(
                name
            );

            info.appendChild(
                model
            );

            const controls =
                document.createElement(
                    "div"
                );

            controls.className =
                "api-profile-controls";

            const enabled =
                document.createElement(
                    "button"
                );

            enabled.type =
                "button";

            enabled.className =
                "profile-control-button";

            enabled.textContent =
                profile.enabled
                    ? "On"
                    : "Off";

            enabled.addEventListener(
                "click",
                () => {
                    toggleProfile(
                        profile.id
                    );
                }
            );

            const edit =
                document.createElement(
                    "button"
                );

            edit.type =
                "button";

            edit.className =
                "profile-control-button";

            edit.textContent =
                "Edit";

            edit.addEventListener(
                "click",
                () => {
                    selectProfile(
                        profile.id
                    );

                    populateSettingsForm();

                    showToast(
                        `Selected ${profile.name}.`
                    );
                }
            );

            const remove =
                document.createElement(
                    "button"
                );

            remove.type =
                "button";

            remove.className =
                "profile-control-button danger";

            remove.textContent =
                "Delete";

            remove.addEventListener(
                "click",
                () => {
                    deleteProfile(
                        profile.id
                    );
                }
            );

            controls.appendChild(
                enabled
            );

            controls.appendChild(
                edit
            );

            if (
                state.profiles.length > 1
            ) {
                controls.appendChild(
                    remove
                );
            }

            top.appendChild(
                radio
            );

            top.appendChild(
                info
            );

            top.appendChild(
                controls
            );

            card.appendChild(
                top
            );

            const details =
                document.createElement(
                    "div"
                );

            details.className =
                "api-profile-details";

            details.textContent =
                maskApiUrl(
                    profile.apiUrl
                );

            card.appendChild(
                details
            );

            list.appendChild(
                card
            );
        }
    );
}

function selectProfile(id) {
    const profile =
        getProfileById(id);

    if (!profile) {
        return;
    }

    if (!profile.enabled) {
        showToast(
            "Enable this profile first."
        );

        return;
    }

    state.activeProfileId =
        profile.id;

    populateSettingsForm();

    updateModelDisplay();

    renderProfileManager();

    saveProfiles();
}

function addNewProfile() {
    const profile = {
        ...DEFAULT_PROFILE,
        id: createId(),
        name:
            `API Profile ${
                state.profiles.length + 1
            }`
    };

    state.profiles.push(
        profile
    );

    state.activeProfileId =
        profile.id;

    saveProfiles();

    populateSettingsForm();

    updateModelDisplay();

    renderProfileManager();

    showToast(
        "New API profile created."
    );
}

function toggleProfile(id) {
    const profile =
        getProfileById(id);

    if (!profile) {
        return;
    }

    if (
        profile.enabled &&
        state.profiles.filter(
            item => item.enabled
        ).length === 1
    ) {
        showToast(
            "At least one profile must remain enabled."
        );

        return;
    }

    profile.enabled =
        !profile.enabled;

    if (
        !profile.enabled &&
        state.activeProfileId ===
            profile.id
    ) {
        const replacement =
            getUsableProfiles().find(
                item =>
                    item.id !==
                    profile.id
            );

        if (replacement) {
            state.activeProfileId =
                replacement.id;
        }
    }

    saveProfiles();

    populateSettingsForm();

    updateModelDisplay();

    renderProfileManager();
}

function deleteProfile(id) {
    if (
        state.profiles.length <= 1
    ) {
        showToast(
            "You must keep at least one API profile."
        );

        return;
    }

    const profile =
        getProfileById(id);

    if (!profile) {
        return;
    }

    const confirmed =
        window.confirm(
            `Delete API profile "${profile.name}"?`
        );

    if (!confirmed) {
        return;
    }

    state.profiles =
        state.profiles.filter(
            item =>
                item.id !== id
        );

    if (
        state.activeProfileId ===
        id
    ) {
        const replacement =
            getUsableProfiles()[0] ||
            state.profiles[0];

        state.activeProfileId =
            replacement.id;
    }

    saveProfiles();

    populateSettingsForm();

    updateModelDisplay();

    renderProfileManager();

    showToast(
        "API profile deleted."
    );
}

function maskApiUrl(url) {
    if (!url) {
        return "No API URL configured";
    }

    try {
        const parsed =
            new URL(url);

        return (
            parsed.protocol +
            "//" +
            parsed.host +
            parsed.pathname
        );
    } catch {
        return url;
    }
}


/* ============================================================
   Nova AI Universal Workspace Enhancements
   Version: 1.0.0
   ============================================================ */

function logApiEvent(type, profile, status, duration, message) {
    const storageKey = "nova_ai_error_logs_v1";
    let logs = [];

    try {
        const raw = localStorage.getItem(storageKey);
        logs = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(logs)) logs = [];
    } catch {
        logs = [];
    }

    logs.unshift({
        id: `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        type: String(type ?? "event"),
        profileId: profile?.id || null,
        profileName: String(profile?.name ?? "Unknown"),
        status: Number(status) || 0,
        duration: Number(duration) || 0,
        message: String(message ?? ""),
        timestamp: Date.now()
    });

    try {
        localStorage.setItem(
            storageKey,
            JSON.stringify(logs.slice(0, 300))
        );
    } catch {
        // Logging must never break API requests.
    }
}


function getInspectorLogs() {
    try {
        const raw = localStorage.getItem("nova_ai_error_logs_v1");
        const logs = raw ? JSON.parse(raw) : [];
        return Array.isArray(logs) ? logs : [];
    } catch {
        return [];
    }
}

function formatInspectorDuration(ms) {
    const value = Number(ms) || 0;
    if (value < 1000) return `${Math.round(value)} ms`;
    return `${(value / 1000).toFixed(2)} s`;
}

function inspectorStatusClass(status) {
    const code = Number(status) || 0;
    if (code >= 200 && code < 300) return "success";
    if (code === 429 || code === 408) return "warning";
    if (code >= 400) return "error";
    return "neutral";
}

function getWorkspaceHealth() {
    const checks = [];
    const requiredElements = [
        "chatArea",
        "messages",
        "messageInput",
        "sendButton",
        "attachButton",
        "settingsModal",
        "activeModel"
    ];

    const missing = requiredElements.filter(id => !document.getElementById(id));
    checks.push({
        label: "Core UI",
        detail: missing.length ? `${missing.length} required element(s) missing` : "All core controls detected",
        state: missing.length ? "error" : "success"
    });

    checks.push({
        label: "Markdown",
        detail: typeof window.marked === "function" ? "Marked loaded" : "Marked unavailable",
        state: typeof window.marked === "function" ? "success" : "warning"
    });

    checks.push({
        label: "Sanitizer",
        detail: window.DOMPurify ? "DOMPurify loaded" : "DOMPurify unavailable",
        state: window.DOMPurify ? "success" : "warning"
    });

    const usableProfiles = state.profiles.filter(profile =>
        profile.enabled && profile.apiUrl && profile.model
    );
    checks.push({
        label: "API Profiles",
        detail: usableProfiles.length
            ? `${usableProfiles.length} configured and enabled`
            : "No enabled profile with URL + model",
        state: usableProfiles.length ? "success" : "warning"
    });

    checks.push({
        label: "Chats",
        detail: `${state.chats.length} conversation${state.chats.length === 1 ? "" : "s"} available`,
        state: "success"
    });

    let storageOk = true;
    try {
        const key = "__nova_health_check__";
        localStorage.setItem(key, "1");
        localStorage.removeItem(key);
    } catch {
        storageOk = false;
    }
    checks.push({
        label: "Local storage",
        detail: storageOk ? "Available" : "Unavailable or blocked",
        state: storageOk ? "success" : "error"
    });

    const hasGeneratingRequest = !!state.isGenerating;
    checks.push({
        label: "Generation",
        detail: hasGeneratingRequest ? "Request in progress" : "Idle",
        state: hasGeneratingRequest ? "working" : "success"
    });

    return checks;
}

function updateWorkspaceHealthIndicator() {
    const dot = document.getElementById("workspaceHealthDot");
    const label = document.getElementById("workspaceHealthLabel");
    if (!dot || !label) return;

    const checks = getWorkspaceHealth();
    const hasError = checks.some(check => check.state === "error");
    const hasWarning = checks.some(check => check.state === "warning");

    dot.className = "workspace-health-dot";
    if (hasError) {
        dot.classList.add("is-error");
        label.textContent = "Attention";
    } else if (hasWarning) {
        dot.classList.add("is-warning");
        label.textContent = "Check";
    } else {
        dot.classList.add("is-ready");
        label.textContent = state.isGenerating ? "Working" : "Ready";
    }
}

function renderWorkspaceHealth() {
    const grid = document.getElementById("workspaceHealthGrid");
    if (!grid) return;

    grid.innerHTML = getWorkspaceHealth().map(check => `
        <div class="workspace-health-card">
            <span class="workspace-health-card-dot ${escapeHtml(check.state)}"></span>
            <div>
                <strong>${escapeHtml(check.label)}</strong>
                <span>${escapeHtml(check.detail)}</span>
            </div>
        </div>
    `).join("");
}

function renderRequestInspector() {
    const list = document.getElementById("requestInspectorList");
    const summary = document.getElementById("requestInspectorSummary");
    if (!list || !summary) return;

    renderWorkspaceHealth();
    updateWorkspaceHealthIndicator();

    const logs = getInspectorLogs().slice(0, 50);
    const successful = logs.filter(item => Number(item.status) >= 200 && Number(item.status) < 300).length;
    const failed = logs.filter(item => Number(item.status) >= 400).length;
    const avg = logs.length
        ? logs.reduce((sum, item) => sum + (Number(item.duration) || 0), 0) / logs.length
        : 0;

    summary.innerHTML = `
        <div class="inspector-stat"><strong>${logs.length}</strong><span>Requests</span></div>
        <div class="inspector-stat"><strong>${successful}</strong><span>Successful</span></div>
        <div class="inspector-stat"><strong>${failed}</strong><span>Failed</span></div>
        <div class="inspector-stat"><strong>${formatInspectorDuration(avg)}</strong><span>Avg. time</span></div>
    `;

    if (!logs.length) {
        list.innerHTML = `
            <div class="inspector-empty">
                <div class="inspector-empty-icon">⌁</div>
                <h3>No API activity yet</h3>
                <p>Your request telemetry will appear here after the next API call.</p>
            </div>
        `;
        return;
    }

    list.innerHTML = logs.map(item => {
        const status = Number(item.status) || 0;
        const stateClass = inspectorStatusClass(status);
        const time = item.timestamp
            ? new Date(item.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
            })
            : "—";

        return `
            <article class="inspector-row">
                <div class="inspector-row-main">
                    <div class="inspector-provider">
                        <span class="inspector-dot ${stateClass}"></span>
                        <strong>${escapeHtml(item.profileName || "Unknown")}</strong>
                        <span class="inspector-type">${escapeHtml(item.type || "request")}</span>
                    </div>
                    <div class="inspector-meta">
                        <span>${time}</span>
                        <span>${formatInspectorDuration(item.duration)}</span>
                        <span class="inspector-status ${stateClass}">${status || "—"}</span>
                    </div>
                </div>
                <div class="inspector-message">${escapeHtml(item.message || "No details")}</div>
            </article>
        `;
    }).join("");
}

function openRequestInspector() {
    const modal = document.getElementById("requestInspectorModal");
    if (!modal) return;

    renderRequestInspector();
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("inspector-open");
}

function closeRequestInspector() {
    const modal = document.getElementById("requestInspectorModal");
    if (!modal) return;

    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("inspector-open");
}

function clearRequestInspectorLogs() {
    try {
        localStorage.removeItem("nova_ai_error_logs_v1");
    } catch {
        // Logging cleanup must never break the workspace.
    }
    renderRequestInspector();
    if (typeof showToast === "function") {
        showToast("Request logs cleared.");
    }
}

document.addEventListener("DOMContentLoaded", () => {
    setupSidebarCollapse();
    setupNovaThemeEngine();
    document.getElementById("closeRequestInspector")?.addEventListener(
        "click",
        closeRequestInspector
    );

    document.querySelectorAll("[data-inspector-close]").forEach(node => {
        node.addEventListener("click", closeRequestInspector);
    });

    document.getElementById("refreshRequestInspector")?.addEventListener(
        "click",
        renderRequestInspector
    );

    document.getElementById("clearRequestLogs")?.addEventListener(
        "click",
        clearRequestInspectorLogs
    );

    document.getElementById("workspaceHealthButton")?.addEventListener(
        "click",
        openRequestInspector
    );

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") closeRequestInspector();

        if (
            (event.ctrlKey || event.metaKey) &&
            event.shiftKey &&
            event.key.toLowerCase() === "i"
        ) {
            event.preventDefault();
            openRequestInspector();
        }
    });

    updateWorkspaceHealthIndicator();
});


const NOVA_THEME_KEY = "nova_ai_theme_v2";
const NOVA_THEME_VALUES = new Set(["dark", "light", "gold-silver"]);

function getSavedNovaTheme() {
    const saved = localStorage.getItem(NOVA_THEME_KEY);
    if (NOVA_THEME_VALUES.has(saved)) return saved;

    const legacy = localStorage.getItem("nova_ai_theme");
    if (legacy === "light" || legacy === "dark") return legacy;

    return document.documentElement.classList.contains("light") ? "light" : "dark";
}

function applyNovaTheme(theme, persist = true) {
    const nextTheme = NOVA_THEME_VALUES.has(theme) ? theme : "dark";
    const root = document.documentElement;

    root.dataset.theme = nextTheme;
    root.classList.toggle("light", nextTheme === "light");
    root.classList.toggle("gold-silver", nextTheme === "gold-silver");

    if (persist) {
        localStorage.setItem(NOVA_THEME_KEY, nextTheme);
        localStorage.setItem("nova_ai_theme", nextTheme);
    }

    updateNovaThemeUI(nextTheme);
}

function updateNovaThemeUI(theme) {
    const name = document.getElementById("themeSwitcherName");
    const swatch = document.getElementById("themeSwitcherSwatch");
    const menu = document.getElementById("themeModeMenu");

    const labels = {
        dark: "Dark",
        light: "Light",
        "gold-silver": "Gold & Silver"
    };

    if (name) name.textContent = labels[theme] || "Dark";
    if (swatch) {
        swatch.className = `theme-switcher-swatch theme-swatch-${theme}`;
    }

    document.querySelectorAll("[data-theme-choice]").forEach(option => {
        const active = option.dataset.themeChoice === theme;
        option.classList.toggle("active", active);
        option.setAttribute("aria-selected", active ? "true" : "false");
    });

    if (menu) {
        menu.classList.remove("open");
    }

    document.getElementById("themeModeButton")?.setAttribute("aria-expanded", "false");
}

function toggleNovaThemeMenu(force) {
    const menu = document.getElementById("themeModeMenu");
    const button = document.getElementById("themeModeButton");
    if (!menu || !button) return;

    const open = typeof force === "boolean" ? force : !menu.classList.contains("open");
    menu.classList.toggle("open", open);
    button.setAttribute("aria-expanded", open ? "true" : "false");
}

function setupNovaThemeEngine() {
    const current = getSavedNovaTheme();
    applyNovaTheme(current, false);

    document.getElementById("themeModeButton")?.addEventListener("click", event => {
        event.stopPropagation();
        toggleNovaThemeMenu();
    });

    document.querySelectorAll("[data-theme-choice]").forEach(option => {
        option.addEventListener("click", () => {
            applyNovaTheme(option.dataset.themeChoice);
            if (typeof showToast === "function") {
                showToast(`${option.textContent.trim().split(/\s+/).slice(0, 3).join(" ")} theme applied.`);
            }
        });
    });

    document.addEventListener("click", event => {
        if (!document.getElementById("themeSwitcher")?.contains(event.target)) {
            toggleNovaThemeMenu(false);
        }
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") toggleNovaThemeMenu(false);
    });
}

(function setupUniversalWorkspace() {
    "use strict";

    const NAI = {
        dbName: "nova_ai_workspace",
        dbVersion: 1,
        chatStore: "chats",
        logsKey: "nova_ai_error_logs_v1",
        presetsKey: "nova_ai_presets_v1",
        personasKey: "nova_ai_personas_v1",
        uiKey: "nova_ai_ui_v1",
        search: "",
        activeTab: "overview",
        compareAbortController: null
    };

    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

    setupCommandPalette();
    setupModelSwitcher();
    setupKeyboardShortcuts();

    function setupCommandPalette() {
        if (document.getElementById("naiCommandPalette")) return;

        const overlay = document.createElement("div");
        overlay.id = "naiCommandPalette";
        overlay.className = "nai-command-overlay hidden";
        overlay.innerHTML = `
            <div class="nai-command-palette" role="dialog" aria-modal="true" aria-label="Command palette">
                <div class="nai-command-search-row">
                    <span class="nai-command-icon">⌘</span>
                    <input id="naiCommandInput" type="search" autocomplete="off" placeholder="Search commands...">
                    <kbd>Esc</kbd>
                </div>
                <div class="nai-command-list" id="naiCommandList"></div>
                <div class="nai-command-footer">Ctrl/⌘ K · Navigate with ↑ ↓ · Enter to run</div>
            </div>
        `;
        document.body.appendChild(overlay);

        const commands = [
            { id: "new-chat", label: "New chat", hint: "Start a fresh conversation", icon: "+", run: () => createNewChat(true) },
            { id: "search", label: "Search chats", hint: "Find conversations and messages", icon: "⌕", run: () => focusChatSearch() },
            { id: "profiles", label: "API Profiles", hint: "Manage providers and failover", icon: "◉", run: () => openControlCenter("profiles") },
            { id: "compare", label: "Compare models", hint: "Run the same prompt across profiles", icon: "⇄", run: () => openCompareModal() },
            { id: "settings", label: "Settings", hint: "API and model configuration", icon: "⚙", run: () => openSettings() },
            { id: "theme", label: "Toggle theme", hint: "Switch dark and light mode", icon: "☾", run: () => toggleTheme() },
            { id: "export", label: "Export all chats", hint: "Download a JSON backup", icon: "↓", run: () => exportAllChats() },
            { id: "scroll-bottom", label: "Scroll to latest", hint: "Jump to the newest message", icon: "↓", run: () => scrollChatToBottom() }
        ];

        const input = overlay.querySelector("#naiCommandInput");
        const list = overlay.querySelector("#naiCommandList");
        let selected = 0;
        let visible = commands;

        function render() {
            const query = input.value.trim().toLowerCase();
            visible = commands.filter(command =>
                `${command.label} ${command.hint}`.toLowerCase().includes(query)
            );
            selected = Math.min(selected, Math.max(visible.length - 1, 0));
            list.innerHTML = visible.length ? visible.map((command, index) => `
                <button type="button" class="nai-command-item ${index === selected ? "is-selected" : ""}" data-command="${command.id}">
                    <span class="nai-command-item-icon">${escapeHtml(command.icon)}</span>
                    <span class="nai-command-item-copy"><strong>${escapeHtml(command.label)}</strong><small>${escapeHtml(command.hint)}</small></span>
                    <span class="nai-command-arrow">↵</span>
                </button>
            `).join("") : `<div class="nai-command-empty">No commands found.</div>`;
            list.querySelectorAll("[data-command]").forEach(button => {
                button.addEventListener("click", () => runCommand(button.dataset.command));
            });
        }

        function runCommand(id) {
            const command = commands.find(item => item.id === id);
            close();
            if (command) command.run();
        }

        function open() {
            overlay.classList.remove("hidden");
            input.value = "";
            selected = 0;
            render();
            requestAnimationFrame(() => input.focus());
        }

        function close() {
            overlay.classList.add("hidden");
        }

        overlay.addEventListener("click", event => {
            if (event.target === overlay) close();
        });

        input.addEventListener("input", render);
        input.addEventListener("keydown", event => {
            if (event.key === "ArrowDown") { event.preventDefault(); selected = Math.min(selected + 1, visible.length - 1); render(); }
            if (event.key === "ArrowUp") { event.preventDefault(); selected = Math.max(selected - 1, 0); render(); }
            if (event.key === "Enter" && visible[selected]) { event.preventDefault(); runCommand(visible[selected].id); }
            if (event.key === "Escape") { event.preventDefault(); close(); }
        });

        window.novaCommandPalette = { open, close };
    }

    function focusChatSearch() {
        const search = document.getElementById("naiChatSearch");
        if (search) {
            search.focus();
            search.select();
            return;
        }
        document.querySelector(".sidebar-section")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function setupModelSwitcher() {
        const button = document.getElementById("activeModel");
        if (!button || button.dataset.novaModelSwitcher === "true") return;
        button.dataset.novaModelSwitcher = "true";
        button.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            toggleModelMenu(button);
        }, true);
    }

    function toggleModelMenu(anchor) {
        const existing = document.getElementById("naiModelMenu");
        if (existing) { existing.remove(); return; }

        const menu = document.createElement("div");
        menu.id = "naiModelMenu";
        menu.className = "nai-model-menu";
        const usable = state.profiles.filter(profile => profile.enabled && profile.apiUrl && profile.model);
        menu.innerHTML = `
            <div class="nai-model-menu-header"><span>Active model</span><button type="button" id="naiModelManage">Manage</button></div>
            ${usable.length ? usable.map(profile => `
                <button type="button" class="nai-model-option ${profile.id === state.activeProfileId ? "is-active" : ""}" data-profile-id="${escapeHtml(profile.id)}">
                    <span class="nai-model-status"></span>
                    <span><strong>${escapeHtml(profile.model)}</strong><small>${escapeHtml(profile.name || "API Profile")}</small></span>
                    <span class="nai-model-check">${profile.id === state.activeProfileId ? "✓" : ""}</span>
                </button>
            `).join("") : `<div class="nai-model-empty">No configured profiles.</div>`}
        `;
        document.body.appendChild(menu);
        const rect = anchor.getBoundingClientRect();
        menu.style.top = `${rect.bottom + 10}px`;
        menu.style.left = `${Math.max(12, rect.left + rect.width / 2 - 160)}px`;

        menu.querySelectorAll("[data-profile-id]").forEach(item => item.addEventListener("click", () => {
            selectProfile(item.dataset.profileId);
            menu.remove();
            showToast("Model switched.");
        }));
        menu.querySelector("#naiModelManage")?.addEventListener("click", () => {
            menu.remove();
            openControlCenter("profiles");
        });
        setTimeout(() => document.addEventListener("click", function closeMenu(event) {
            if (!menu.contains(event.target) && event.target !== anchor) {
                menu.remove();
                document.removeEventListener("click", closeMenu);
            }
        }), 0);
    }

    function setupKeyboardShortcuts() {
        if (window.novaKeyboardShortcutsReady) return;
        window.novaKeyboardShortcutsReady = true;
        document.addEventListener("keydown", event => {
            const mod = event.ctrlKey || event.metaKey;
            if (mod && event.key.toLowerCase() === "k") {
                event.preventDefault();
                window.novaCommandPalette?.open();
                return;
            }
            if (mod && event.key.toLowerCase() === "n") {
                event.preventDefault();
                createNewChat(true);
                return;
            }
            if (mod && event.shiftKey && event.key.toLowerCase() === "p") {
                event.preventDefault();
                openControlCenter("profiles");
                return;
            }
            if (event.key === "Escape") {
                if (state.isGenerating) stopGeneration();
                document.getElementById("naiModelMenu")?.remove();
            }
        });
    }

    function safeText(value) {
        return String(value ?? "");
    }

    function escapeHtml(value) {
        return safeText(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function readJson(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch {
            return fallback;
        }
    }

    function writeJson(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            showToast("Could not save workspace data. Storage may be full.");
            return false;
        }
    }

    function uid(prefix = "nai") {
        return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function formatDuration(ms) {
        if (!Number.isFinite(ms)) return "—";
        if (ms < 1000) return `${Math.round(ms)}ms`;
        return `${(ms / 1000).toFixed(2)}s`;
    }

    function profileStatus(profile) {
        if (!profile?.enabled) return { key: "disabled", label: "Disabled" };
        if (profile.cooldownUntil && profile.cooldownUntil > Date.now()) {
            return {
                key: "cooldown",
                label: `Cooldown ${Math.ceil((profile.cooldownUntil - Date.now()) / 1000)}s`
            };
        }
        if (Number(profile.failedAttempts) > 0) {
            return { key: "failed", label: "Failed / Recovering" };
        }
        if (!profile.apiUrl || !profile.model) {
            return { key: "unconfigured", label: "Not configured" };
        }
        return { key: "online", label: profile.lastSuccessAt ? "Online" : "Configured" };
    }

    function injectWorkspaceStyles() {
        if ($("#naiWorkspaceStyles")) return;
        const style = document.createElement("style");
        style.id = "naiWorkspaceStyles";
        style.textContent = `
            .nai-sidebar-tools{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}.sidebar.is-collapsed .nai-sidebar-tools{display:flex;flex-direction:column;align-items:center;gap:5px;width:100%;margin:10px 0}.sidebar.is-collapsed .nai-sidebar-tools .nai-tool-button{width:44px;min-width:44px;height:42px;min-height:42px;padding:0;justify-content:center;white-space:nowrap;overflow:hidden;border-radius:12px}
            .nai-tool-button{border:1px solid var(--border-color,#2b2f3a);background:var(--surface-2,#171a22);color:var(--text-primary,#fff);border-radius:12px;padding:10px 9px;cursor:pointer;font:inherit;font-size:12px;display:flex;align-items:center;justify-content:center;gap:7px;transition:.2s}
            .nai-tool-button:hover{border-color:rgba(139,92,246,.65);transform:translateY(-1px);background:rgba(139,92,246,.08)}
            .nai-search-wrap{padding:0 2px 10px}
            .nai-search{width:100%;box-sizing:border-box;border:1px solid var(--border-color,#2b2f3a);background:var(--surface-2,#171a22);color:var(--text-primary,#fff);border-radius:11px;padding:10px 12px;outline:none;font:inherit;font-size:12px}
            .nai-search:focus{border-color:#8b5cf6;box-shadow:0 0 0 3px rgba(139,92,246,.12)}
            .nai-chat-extra{display:flex;gap:4px;margin-inline-start:auto;opacity:0;transition:.15s}
            .chat-item:hover .nai-chat-extra{opacity:1}
            .nai-chat-extra button{border:0;background:transparent;color:var(--text-muted,#8991a4);cursor:pointer;padding:3px;border-radius:6px}
            .nai-chat-extra button:hover{background:rgba(255,255,255,.08);color:#fff}
            .nai-chat-pin{font-size:10px;color:#a78bfa;margin-inline-start:5px}
            .nai-modal-backdrop{position:fixed;inset:0;background:rgba(2,4,10,.72);backdrop-filter:blur(12px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px}
            .nai-modal{width:min(1100px,96vw);max-height:min(850px,92vh);overflow:hidden;background:#10131b;border:1px solid rgba(255,255,255,.1);border-radius:22px;box-shadow:0 30px 100px rgba(0,0,0,.5);color:#eef1f8;display:flex;flex-direction:column}
            .nai-modal-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid rgba(255,255,255,.08)}
            .nai-modal-title{font-weight:800;font-size:17px}.nai-modal-sub{font-size:11px;color:#8991a4;margin-top:3px}
            .nai-close{border:0;background:rgba(255,255,255,.06);color:#fff;width:34px;height:34px;border-radius:10px;cursor:pointer;font-size:18px}
            .nai-tabs{display:flex;gap:6px;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.07);overflow:auto}
            .nai-tab{border:0;background:transparent;color:#8f96a8;padding:9px 12px;border-radius:9px;cursor:pointer;font:inherit;font-size:12px;white-space:nowrap}
            .nai-tab.active{background:rgba(139,92,246,.15);color:#c4b5fd}
            .nai-modal-body{overflow:auto;padding:18px}
            .nai-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
            .nai-card{background:#151923;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:15px}
            .nai-card h3{font-size:13px;margin:0 0 6px}.nai-muted{color:#8c94a8;font-size:11px}
            .nai-stat{font-size:24px;font-weight:800;margin-top:8px}.nai-status{display:inline-flex;align-items:center;gap:6px;font-size:10px;border-radius:999px;padding:5px 8px;background:rgba(255,255,255,.06)}
            .nai-status:before{content:"";width:6px;height:6px;border-radius:50%;background:#6b7280}
            .nai-status.online:before{background:#34d399}.nai-status.cooldown:before{background:#f59e0b}.nai-status.failed:before{background:#fb7185}.nai-status.disabled:before{background:#6b7280}.nai-status.unconfigured:before{background:#60a5fa}
            .nai-profile-row{display:flex;align-items:center;gap:10px;padding:12px;border:1px solid rgba(255,255,255,.07);background:#121620;border-radius:13px;margin-bottom:8px;cursor:grab}
            .nai-profile-row.dragging{opacity:.45}.nai-drag{color:#70788b;cursor:grab}.nai-profile-main{flex:1;min-width:0}.nai-profile-name{font-weight:700;font-size:12px}.nai-profile-model{font-size:10px;color:#8c94a8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:3px}
            .nai-profile-actions{display:flex;gap:5px}.nai-mini{border:1px solid rgba(255,255,255,.08);background:#1a1e29;color:#dfe3ed;border-radius:8px;padding:6px 8px;cursor:pointer;font:inherit;font-size:10px}
            .nai-mini:hover{border-color:#8b5cf6}.nai-primary{border:0;background:linear-gradient(135deg,#8b5cf6,#6d28d9);color:#fff;border-radius:10px;padding:9px 13px;cursor:pointer;font:inherit;font-size:11px;font-weight:700}
            .nai-danger{color:#fda4af}.nai-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.nai-field{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}.nai-field label{font-size:11px;color:#aab1c1}.nai-field input,.nai-field textarea,.nai-field select{background:#0d1017;border:1px solid rgba(255,255,255,.1);color:#fff;border-radius:10px;padding:10px;outline:none;font:inherit;font-size:12px}.nai-field textarea{min-height:100px;resize:vertical}
            .nai-log{padding:10px 12px;border:1px solid rgba(255,255,255,.07);border-radius:10px;margin-bottom:7px;background:#121620;font-size:11px}.nai-log b{font-size:11px}.nai-log small{display:block;color:#7f8799;margin-top:4px}
            .nai-chat-results{display:grid;gap:7px}.nai-chat-result{padding:11px;border-radius:11px;background:#151923;border:1px solid rgba(255,255,255,.07);cursor:pointer}.nai-chat-result:hover{border-color:#8b5cf6}
            .nai-compare-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px}.nai-compare-card{background:#141823;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:13px;min-height:180px}.nai-compare-card pre{white-space:pre-wrap;font:inherit;font-size:12px;line-height:1.7;color:#dce1eb}
            .nai-action-bar{display:flex;gap:5px;flex-wrap:wrap;margin-top:9px}.nai-action{border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.035);color:#aeb6c8;border-radius:8px;padding:6px 8px;cursor:pointer;font:inherit;font-size:10px}.nai-action:hover{color:#fff;border-color:rgba(139,92,246,.6);background:rgba(139,92,246,.08)}
            .nai-empty{padding:25px;text-align:center;color:#81899b;font-size:12px}
            .nai-lightbox{position:fixed;inset:0;z-index:11000;background:rgba(0,0,0,.9);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:30px}
            .nai-lightbox-inner{position:relative;max-width:96vw;max-height:94vh;display:flex;flex-direction:column;align-items:center;gap:10px}
            .nai-lightbox-image{max-width:92vw;max-height:82vh;object-fit:contain;border-radius:14px;box-shadow:0 25px 80px rgba(0,0,0,.65);cursor:zoom-in;transition:transform .2s}
            .nai-lightbox-image.zoomed{max-width:none;max-height:none;cursor:zoom-out;transform:scale(1.65)}
            .nai-lightbox-toolbar{display:flex;gap:6px;position:absolute;top:-8px;right:0;transform:translateY(-100%)}
            .nai-lightbox-toolbar button{border:0;background:rgba(25,29,39,.92);color:#fff;border:1px solid rgba(255,255,255,.1);width:36px;height:36px;border-radius:10px;cursor:pointer}
            .nai-lightbox-caption{color:#cfd5e2;font-size:11px;background:rgba(20,23,31,.9);padding:7px 10px;border-radius:8px}
            .nai-drop-zone{border:1px dashed rgba(139,92,246,.5);border-radius:12px;padding:18px;text-align:center;color:#929aad;font-size:11px;margin-bottom:12px}
            @media(max-width:760px){.nai-grid{grid-template-columns:1fr}.nai-modal{max-height:96vh;border-radius:17px}.nai-modal-body{padding:12px}.nai-profile-actions{flex-wrap:wrap}.nai-lightbox-image.zoomed{transform:scale(1.15)}}
        `;
        document.head.appendChild(style);
    }

    function addSidebarTools() {
        const sidebarBottom = $(".sidebar-bottom");
        if (!sidebarBottom || $("#naiSidebarTools")) return;
        const wrap = document.createElement("div");
        wrap.id = "naiSidebarTools";
        wrap.className = "nai-sidebar-tools";
        wrap.innerHTML = `
            <button class="nai-tool-button" type="button" data-nai-action="control">⚡ Control</button>
            <button class="nai-tool-button" type="button" data-nai-action="compare">⇄ Compare</button>
        `;
        sidebarBottom.parentNode.insertBefore(wrap, sidebarBottom);
        wrap.addEventListener("click", event => {
            const action = event.target.closest("[data-nai-action]")?.dataset.naiAction;
            if (action === "control") openControlCenter();
            if (action === "compare") openCompareModal();
        });
    }

    function addChatSearch() {
        const section = $(".sidebar-section");
        if (!section || $("#naiChatSearch")) return;

        const title = section.querySelector(".section-title");
        const wrap = document.createElement("div");
        wrap.className = "nai-search-wrap";
        wrap.innerHTML = `<input id="naiChatSearch" class="nai-search" type="search" placeholder="Search conversations...">`;
        title?.after(wrap);

        $("#naiChatSearch").addEventListener("input", event => {
            NAI.search = event.target.value.trim().toLowerCase();
            renderChatList();
            renderChatEnhancements();
        });
    }

    function ensureChatFields() {
        state.chats.forEach(chat => {
            if (typeof chat.pinned !== "boolean") chat.pinned = false;
            if (!Array.isArray(chat.tags)) chat.tags = [];
            if (typeof chat.folder !== "string") chat.folder = "";
        });
        saveChats();
    }

    function getFilteredChats() {
        const chats = [...state.chats].sort((a,b) => {
            if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
            return (b.updatedAt || 0) - (a.updatedAt || 0);
        });
        if (!NAI.search) return chats;
        return chats.filter(chat => {
            const haystack = [
                chat.title,
                chat.folder,
                ...(chat.messages || []).map(message => message.content || "")
            ].join(" ").toLowerCase();
            return haystack.includes(NAI.search);
        });
    }

    function renderChatEnhancements() {
        const list = elements.chatList;
        if (!list) return;

        const chats = getFilteredChats();
        const allowedIds = new Set(chats.map(chat => chat.id));

        if (NAI.search) {
            const items = $$(".chat-item", list);
            if (!items.length || items.some(item => !item.dataset.chatId)) {
                renderChatList();
            }
        }

        const items = $$(".chat-item", list);
        items.forEach(item => {
            const id = item.dataset.chatId;
            item.style.display = !NAI.search || allowedIds.has(id) ? "" : "none";
        });

        if (NAI.search && chats.length === 0) {
            list.innerHTML = `<div class="nai-empty">No conversations match your search.</div>`;
            return;
        }

        items.forEach(item => {
            const id = item.dataset.chatId;
            const chat = state.chats.find(c => c.id === id);
            if (!chat) return;

            const title = item.querySelector(".chat-item-title");
            if (chat.pinned && title && !title.querySelector(".nai-chat-pin")) {
                const pin = document.createElement("span");
                pin.className = "nai-chat-pin";
                pin.textContent = "◆";
                title.appendChild(pin);
            }

            let actions = item.querySelector(".nai-chat-extra");
            if (!actions) {
                actions = document.createElement("div");
                actions.className = "nai-chat-extra";
                actions.innerHTML = `
                    <button type="button" title="Rename">✎</button>
                    <button type="button" title="Pin">◆</button>
                    <button type="button" title="Folder">▣</button>
                    <button type="button" title="Delete">×</button>
                `;
                item.appendChild(actions);
                actions.children[0].addEventListener("click", event => {
                    event.stopPropagation();
                    renameChat(id);
                });
                actions.children[1].addEventListener("click", event => {
                    event.stopPropagation();
                    togglePinChat(id);
                });
                actions.children[2].addEventListener("click", event => {
                    event.stopPropagation();
                    setChatFolder(id);
                });
                actions.children[3].addEventListener("click", event => {
                    event.stopPropagation();
                    deleteChat(id);
                });
            }
        });
    }

    function renameChat(id) {
        const chat = state.chats.find(item => item.id === id);
        if (!chat) return;
        const title = window.prompt("Chat name", chat.title || "New chat");
        if (!title?.trim()) return;
        chat.title = title.trim().slice(0, 120);
        chat.updatedAt = Date.now();
        saveChats();
        renderChatList();
        renderChatEnhancements();
    }

    function deleteChat(id) {
        const chat = state.chats.find(item => item.id === id);
        if (!chat) return;
        if (!window.confirm(`Delete "${chat.title}"?`)) return;
        state.chats = state.chats.filter(item => item.id !== id);
        if (state.currentChatId === id) {
            state.currentChatId = state.chats[0]?.id || null;
            if (!state.currentChatId) createNewChat(false);
            else renderCurrentChat();
        }
        saveChats();
        renderChatList();
        renderChatEnhancements();
        syncChatsToIndexedDB();
    }

    function togglePinChat(id) {
        const chat = state.chats.find(item => item.id === id);
        if (!chat) return;
        chat.pinned = !chat.pinned;
        chat.updatedAt = Date.now();
        saveChats();
        renderChatList();
        renderChatEnhancements();
    }

    function setChatFolder(id) {
        const chat = state.chats.find(item => item.id === id);
        if (!chat) return;
        const folder = window.prompt("Folder name (leave empty to remove)", chat.folder || "");
        if (folder === null) return;
        chat.folder = folder.trim().slice(0, 60);
        chat.updatedAt = Date.now();
        saveChats();
        renderChatList();
        renderChatEnhancements();
    }

    function exportChat(chat) {
        const payload = {
            version: 1,
            exportedAt: new Date().toISOString(),
            app: "Nova AI",
            chat
        };
        downloadBlob(JSON.stringify(payload, null, 2), `${safeFileName(chat.title || "chat")}.json`, "application/json");
    }

    function exportAllChats() {
        const payload = {
            version: 1,
            exportedAt: new Date().toISOString(),
            app: "Nova AI",
            chats: state.chats
        };
        downloadBlob(JSON.stringify(payload, null, 2), `nova-ai-chats-${Date.now()}.json`, "application/json");
    }

    function downloadBlob(content, filename, type) {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function safeFileName(value) {
        return safeText(value).replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80) || "chat";
    }

    function importChatsFile(file) {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = JSON.parse(reader.result);
                const imported = Array.isArray(data) ? data : (Array.isArray(data.chats) ? data.chats : (data.chat ? [data.chat] : []));
                if (!imported.length) throw new Error("No chats found in the file.");
                const existing = new Set(state.chats.map(chat => chat.id));
                imported.forEach(chat => {
                    const copy = JSON.parse(JSON.stringify(chat));
                    copy.id = existing.has(copy.id) ? uid("chat") : copy.id || uid("chat");
                    existing.add(copy.id);
                    copy.title = copy.title || "Imported chat";
                    copy.messages = Array.isArray(copy.messages) ? copy.messages : [];
                    state.chats.push(copy);
                });
                saveChats();
                renderChatList();
                renderChatEnhancements();
                syncChatsToIndexedDB();
                showToast(`Imported ${imported.length} chat${imported.length === 1 ? "" : "s"}.`);
            } catch (error) {
                showToast(`Import failed: ${error.message}`);
            }
        };
        reader.readAsText(file);
    }

    function addChatToolsToList() {
        const section = $(".sidebar-section");
        if (!section || $("#naiChatTools")) return;
        const wrap = document.createElement("div");
        wrap.id = "naiChatTools";
        wrap.className = "nai-toolbar";
        wrap.style.padding = "0 2px 8px";
        wrap.innerHTML = `
            <button class="nai-mini" type="button" data-chat-tool="export">Export all</button>
            <button class="nai-mini" type="button" data-chat-tool="import">Import</button>
        `;
        const search = $("#naiChatSearch");
        search?.parentElement?.after(wrap);
        wrap.addEventListener("click", event => {
            const action = event.target.closest("[data-chat-tool]")?.dataset.chatTool;
            if (action === "export") exportAllChats();
            if (action === "import") openImportPicker();
        });
    }

    function openImportPicker() {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json,application/json";
        input.onchange = () => input.files[0] && importChatsFile(input.files[0]);
        input.click();
    }

    function enhanceMessageActions() {
        const chat = getCurrentChat();
        if (!chat) return;
        $$(".message", elements.messages).forEach(article => {
            if (article.querySelector(".nai-action-bar")) return;
            const id = article.dataset.messageId;
            const message = chat.messages.find(item => item.id === id);
            if (!message) return;

            const bar = document.createElement("div");
            bar.className = "nai-action-bar";

            if (message.role === "assistant") {
                bar.innerHTML = `
                    <button class="nai-action" data-message-action="copy">Copy</button>
                    <button class="nai-action" data-message-action="regenerate">Regenerate</button>
                    <button class="nai-action" data-message-action="continue">Continue</button>
                    <button class="nai-action" data-message-action="retry">Retry other API</button>
                `;
            } else {
                bar.innerHTML = `
                    <button class="nai-action" data-message-action="edit">Edit</button>
                    <button class="nai-action" data-message-action="export">Export chat</button>
                `;
            }

            article.querySelector(".message-body")?.appendChild(bar);
            bar.addEventListener("click", event => {
                const action = event.target.closest("[data-message-action]")?.dataset.messageAction;
                if (!action) return;
                handleMessageAction(action, message);
            });
        });
    }

    async function handleMessageAction(action, message) {
        const chat = getCurrentChat();
        if (!chat || state.isGenerating) return;

        if (action === "copy") {
            copyText(message.content || "");
            return;
        }

        if (action === "export") {
            exportChat(chat);
            return;
        }

        const index = chat.messages.findIndex(item => item.id === message.id);
        if (index < 0) return;

        if (action === "regenerate" || action === "retry") {
            if (message.role !== "assistant") return;

            const userIndex = [...Array(index).keys()]
                .reverse()
                .find(position => chat.messages[position]?.role === "user");

            if (userIndex === undefined) return;

            const previousMessages = chat.messages.slice(0, userIndex + 1);
            const failedProfileId = message.profileId || state.lastRequestProfileId || null;

            chat.messages = previousMessages;

            if (action === "retry") {
                const candidates = getUsableProfiles().filter(profile => profile.id !== failedProfileId);
                if (candidates[0]) {
                    state.activeProfileId = candidates[0].id;
                }
            }

            chat.updatedAt = Date.now();
            saveChats();
            renderChatList();
            renderCurrentChat();
            await generateAssistantResponse(chat);
            return;
        }

        if (action === "continue") {
            if (message.role !== "assistant") return;

            const lastUserIndex = [...Array(index).keys()]
                .reverse()
                .find(position => chat.messages[position]?.role === "user");

            if (lastUserIndex === undefined) return;

            const continuationPrompt = [
                "Continue the previous assistant response from exactly where it stopped.",
                "Do not repeat content already provided."
            ].join(" ");

            const previousMessages = chat.messages.slice(0, index + 1);
            const continuation = {
                id: uid("internal"),
                role: "user",
                content: continuationPrompt,
                attachments: [],
                timestamp: Date.now(),
                internal: true
            };

            chat.messages = [...previousMessages, continuation];
            saveChats();
            renderCurrentChat();
            await generateAssistantResponse(chat, { internalContinuation: true });

            const continuationIndex = chat.messages.findIndex(item => item.id === continuation.id);
            if (continuationIndex >= 0) {
                chat.messages.splice(continuationIndex, 1);
                saveChats();
                renderCurrentChat();
            }
            return;
        }

        if (action === "edit") {
            if (message.role !== "user") return;

            const next = window.prompt("Edit message", message.content || "");
            if (next === null) return;
            const trimmed = next.trim();
            if (!trimmed) return;

            message.content = trimmed;
            chat.messages = chat.messages.slice(0, index + 1);
            chat.updatedAt = Date.now();
            updateChatTitle(chat, trimmed);
            saveChats();
            renderChatList();
            renderCurrentChat();
            await generateAssistantResponse(chat);
        }
    }

    function openControlCenter(defaultTab = "overview") {
        closeNaiModal();
        NAI.activeTab = defaultTab;
        const backdrop = document.createElement("div");
        backdrop.className = "nai-modal-backdrop";
        backdrop.id = "naiControlModal";
        backdrop.innerHTML = `
            <section class="nai-modal" role="dialog" aria-modal="true" aria-label="AI Control Center">
                <header class="nai-modal-head">
                    <div><div class="nai-modal-title">AI Control Center</div><div class="nai-modal-sub">Profiles, health, presets, logs and workspace controls</div></div>
                    <button class="nai-close" type="button" data-nai-close>×</button>
                </header>
                <nav class="nai-tabs">
                    ${[
                        ["overview","Overview"],["profiles","API Profiles"],["logs","Activity & Errors"],
                        ["presets","Presets"],["personas","Personas"],["storage","Backup"]
                    ].map(([key,label]) => `<button class="nai-tab ${key === NAI.activeTab ? "active" : ""}" data-nai-tab="${key}" type="button">${label}</button>`).join("")}
                </nav>
                <div class="nai-modal-body" id="naiControlBody"></div>
            </section>
        `;
        document.body.appendChild(backdrop);
        backdrop.addEventListener("click", event => {
            if (event.target === backdrop || event.target.closest("[data-nai-close]")) closeNaiModal();
            const tab = event.target.closest("[data-nai-tab]")?.dataset.naiTab;
            if (tab) { NAI.activeTab = tab; renderControlBody(); }
        });
        renderControlBody();
    }

    function closeNaiModal() {
        $$(".nai-modal-backdrop").forEach(node => node.remove());
    }

    function renderControlBody() {
        const body = $("#naiControlBody");
        if (!body) return;
        if (NAI.activeTab === "overview") renderOverview(body);
        if (NAI.activeTab === "profiles") renderProfiles(body);
        if (NAI.activeTab === "logs") renderLogs(body);
        if (NAI.activeTab === "presets") renderPresets(body);
        if (NAI.activeTab === "personas") renderPersonas(body);
        if (NAI.activeTab === "storage") renderStorage(body);
    }

    function renderOverview(body) {
        const profiles = state.profiles || [];
        const online = profiles.filter(p => profileStatus(p).key === "online").length;
        const cooldown = profiles.filter(p => profileStatus(p).key === "cooldown").length;
        const errors = readJson(NAI.logsKey, []).length;
        const tokens = state.chats.reduce((sum, chat) => sum + (chat.messages || []).reduce((s,m) => s + Number(m.usage?.total_tokens || m.usage?.totalTokens || 0),0),0);
        body.innerHTML = `
            <div class="nai-toolbar">
                <button class="nai-primary" data-control-action="test-all">Test all profiles</button>
                <button class="nai-mini" data-control-action="new-profile">New profile</button>
                <button class="nai-mini" data-control-action="compare">Compare models</button>
            </div>
            <div class="nai-grid">
                <div class="nai-card"><h3>Profiles</h3><div class="nai-stat">${profiles.length}</div><div class="nai-muted">${online} ready · ${cooldown} cooldown</div></div>
                <div class="nai-card"><h3>Conversations</h3><div class="nai-stat">${state.chats.length}</div><div class="nai-muted">${state.chats.filter(c=>c.pinned).length} pinned</div></div>
                <div class="nai-card"><h3>API Activity</h3><div class="nai-stat">${errors}</div><div class="nai-muted">logged events</div></div>
                <div class="nai-card"><h3>Token usage</h3><div class="nai-stat">${tokens.toLocaleString()}</div><div class="nai-muted">reported total tokens</div></div>
            </div>
            <div class="nai-card" style="margin-top:12px">
                <h3>Profile health</h3>
                <div>${profiles.map(p => {
                    const s=profileStatus(p);
                    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.05)"><span>${escapeHtml(p.name)}</span><span class="nai-status ${s.key}">${escapeHtml(s.label)}</span></div>`;
                }).join("")}</div>
            </div>
        `;
        body.onclick = event => {
            const action = event.target.closest("[data-control-action]")?.dataset.controlAction;
            if (action === "test-all") testAllProfiles();
            if (action === "new-profile") { addNewProfile(); renderControlBody(); }
            if (action === "compare") { closeNaiModal(); openCompareModal(); }
        };
    }

    function renderProfiles(body) {
        body.innerHTML = `
            <div class="nai-toolbar">
                <button class="nai-primary" data-profile-action="test-all">Test all</button>
                <button class="nai-mini" data-profile-action="add">Add profile</button>
                <span class="nai-muted" style="padding:8px">Drag rows to change failover priority.</span>
            </div>
            <div id="naiProfileRows"></div>
        `;
        const list = $("#naiProfileRows", body);
        state.profiles.forEach((profile, index) => {
            const s = profileStatus(profile);
            const row = document.createElement("div");
            row.className = "nai-profile-row";
            row.draggable = true;
            row.dataset.profileId = profile.id;
            row.innerHTML = `
                <span class="nai-drag">☷</span>
                <div class="nai-profile-main"><div class="nai-profile-name">${index+1}. ${escapeHtml(profile.name)}</div><div class="nai-profile-model">${escapeHtml(profile.model || "No model")} · ${escapeHtml(maskApiUrl(profile.apiUrl))}</div></div>
                <span class="nai-status ${s.key}">${escapeHtml(s.label)}</span>
                <div class="nai-profile-actions">
                    <button class="nai-mini" data-profile-action="test" data-profile-id="${profile.id}">Test</button>
                    <button class="nai-mini" data-profile-action="select" data-profile-id="${profile.id}">Use</button>
                </div>
            `;
            row.addEventListener("dragstart", () => row.classList.add("dragging"));
            row.addEventListener("dragend", () => { row.classList.remove("dragging"); persistProfileOrder(list); });
            row.addEventListener("dragover", event => {
                event.preventDefault();
                const dragging = $(".nai-profile-row.dragging", list);
                if (!dragging || dragging === row) return;
                const rect = row.getBoundingClientRect();
                const after = event.clientY > rect.top + rect.height / 2;
                list.insertBefore(dragging, after ? row.nextSibling : row);
            });
            list.appendChild(row);
        });
        body.onclick = event => {
            const button = event.target.closest("[data-profile-action]");
            if (!button) return;
            const action = button.dataset.profileAction;
            const id = button.dataset.profileId;
            if (action === "test") testProfile(id, true);
            if (action === "test-all") testAllProfiles();
            if (action === "add") { addNewProfile(); renderProfiles(body); }
            if (action === "select") { selectProfile(id); renderProfiles(body); }
        };
    }

    function persistProfileOrder(list) {
        const ids = $$(".nai-profile-row", list).map(row => row.dataset.profileId);
        const byId = new Map(state.profiles.map(p => [p.id, p]));
        state.profiles = ids.map(id => byId.get(id)).filter(Boolean);
        saveProfiles();
        renderProfileManager();
        showToast("Profile priority updated.");
    }

    async function testProfile(id, notify = false) {
        const profile = getProfileById(id);
        if (!profile) return;
        const started = performance.now();
        try {
            if (!profile.apiUrl) throw new Error("API URL is not configured.");
            if (!profile.model) throw new Error("Model is not configured.");
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 20000);
            const response = await fetch(profile.apiUrl, {
                method: "POST",
                headers: buildHeaders(profile),
                body: JSON.stringify({ model: profile.model, messages: [{ role:"user", content:"ping" }], stream:false, max_tokens:1 }),
                signal: controller.signal
            });
            clearTimeout(timer);
            const elapsed = performance.now() - started;
            const responseText = await safeReadResponseText(response);
            if (!response.ok) {
                const error = createApiError(response.status, responseText);
                throw error;
            }
            resetProfileFailure(profile);
            profile.lastLatency = elapsed;
            profile.lastSuccessAt = Date.now();
            saveProfiles();
            logApiEvent("success", profile, response.status, elapsed, "Connection test succeeded.");
            if (notify) showToast(`${profile.name}: ${formatDuration(elapsed)}`);
            return { ok:true, latency:elapsed };
        } catch (error) {
            const elapsed = performance.now() - started;
            logApiEvent("error", profile, error.status || 0, elapsed, error.message);
            if (notify) showToast(`${profile.name}: ${error.message}`);
            return { ok:false, error };
        } finally {
            if ($("#naiControlModal")) renderControlBody();
        }
    }

    async function testAllProfiles() {
        for (const profile of state.profiles) await testProfile(profile.id, false);
        showToast("All profile tests completed.");
        if ($("#naiControlModal")) renderControlBody();
    }


    function renderLogs(body) {
        const logs = readJson(NAI.logsKey, []);
        body.innerHTML = `
            <div class="nai-toolbar">
                <button class="nai-mini" data-log-action="clear">Clear logs</button>
                <span class="nai-muted" style="padding:8px">${logs.length} stored events</span>
            </div>
            ${logs.length ? logs.map(log => `
                <div class="nai-log"><b>${escapeHtml(log.profileName)} · ${escapeHtml(log.type)} · ${log.status || "—"} · ${formatDuration(log.duration)}</b><small>${new Date(log.timestamp).toLocaleString()} · ${escapeHtml(log.message)}</small></div>
            `).join("") : `<div class="nai-empty">No API activity logged yet.</div>`}
        `;
        body.onclick = event => {
            if (event.target.closest("[data-log-action=clear]")) {
                writeJson(NAI.logsKey, []);
                renderLogs(body);
            }
        };
    }

    const DEFAULT_PRESETS = [
        {id:"coding",name:"Coding",systemPrompt:"You are an expert software engineer. Give practical, production-ready code and explain important tradeoffs.",temperature:.2,maxTokens:8192},
        {id:"reasoning",name:"Reasoning",systemPrompt:"Think carefully, verify assumptions, and provide a structured answer with concise reasoning.",temperature:.35,maxTokens:8192},
        {id:"writing",name:"Writing",systemPrompt:"You are a precise writing assistant. Produce polished, natural writing while preserving the user's intent.",temperature:.7,maxTokens:4096},
        {id:"research",name:"Research",systemPrompt:"Act as a research assistant. Separate facts, assumptions, and uncertainty. Prefer structured evidence.",temperature:.3,maxTokens:8192}
    ];

    function getPresets() {
        return readJson(NAI.presetsKey, DEFAULT_PRESETS);
    }

    function renderPresets(body) {
        const presets = getPresets();
        body.innerHTML = `
            <div class="nai-toolbar"><span class="nai-muted" style="padding:8px">Apply a workspace preset to the active API profile.</span></div>
            ${presets.map(p => `<div class="nai-card" style="margin-bottom:8px"><div style="display:flex;align-items:center;justify-content:space-between;gap:10px"><div><h3>${escapeHtml(p.name)}</h3><div class="nai-muted">Temperature ${p.temperature} · Max tokens ${p.maxTokens}</div></div><button class="nai-primary" data-preset="${p.id}">Apply</button></div></div>`).join("")}
            <div class="nai-card" style="margin-top:12px"><h3>Create preset</h3>
                <div class="nai-field"><label>Name</label><input id="naiPresetName" placeholder="My preset"></div>
                <div class="nai-field"><label>System prompt</label><textarea id="naiPresetPrompt"></textarea></div>
                <div class="nai-field"><label>Temperature</label><input id="naiPresetTemp" type="number" min="0" max="2" step=".1" value=".7"></div>
                <button class="nai-primary" data-preset-action="save">Save preset</button>
            </div>
        `;
        body.onclick = event => {
            const id = event.target.closest("[data-preset]")?.dataset.preset;
            if (id) applyPreset(id);
            if (event.target.closest("[data-preset-action=save]")) {
                const name = $("#naiPresetName", body).value.trim();
                const prompt = $("#naiPresetPrompt", body).value.trim();
                if (!name || !prompt) return showToast("Enter a preset name and system prompt.");
                const custom = getPresets();
                custom.push({id:uid("preset"),name,systemPrompt:prompt,temperature:Number($("#naiPresetTemp",body).value)||.7,maxTokens:4096});
                writeJson(NAI.presetsKey, custom);
                renderPresets(body);
            }
        };
    }

    function applyPreset(id) {
        const preset = getPresets().find(item => item.id === id);
        const profile = getActiveProfile();
        if (!preset || !profile) return;
        profile.systemPrompt = preset.systemPrompt;
        profile.temperature = preset.temperature;
        profile.maxTokens = preset.maxTokens;
        saveProfiles();
        populateSettingsForm();
        showToast(`${preset.name} preset applied.`);
    }

    const DEFAULT_PERSONAS = [
        {id:"engineer",name:"Senior Engineer",prompt:"Act as a senior software engineer. Be pragmatic, precise, and security-conscious."},
        {id:"teacher",name:"Teacher",prompt:"Teach step by step. Start simple, then deepen the explanation with examples."},
        {id:"reviewer",name:"Code Reviewer",prompt:"Review code critically for correctness, maintainability, security, and edge cases."},
        {id:"writer",name:"Creative Writer",prompt:"Write naturally with strong structure, clear voice, and purposeful detail."}
    ];

    function getPersonas() { return readJson(NAI.personasKey, DEFAULT_PERSONAS); }

    function renderPersonas(body) {
        const personas = getPersonas();
        body.innerHTML = `
            <div class="nai-toolbar"><span class="nai-muted" style="padding:8px">Personas update the active profile system prompt.</span></div>
            ${personas.map(p => `<div class="nai-card" style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;gap:10px"><div><h3>${escapeHtml(p.name)}</h3><div class="nai-muted">${escapeHtml(p.prompt)}</div></div><button class="nai-primary" data-persona="${p.id}">Use</button></div></div>`).join("")}
        `;
        body.onclick = event => {
            const id = event.target.closest("[data-persona]")?.dataset.persona;
            if (!id) return;
            const persona = personas.find(item => item.id === id);
            const profile = getActiveProfile();
            if (!persona || !profile) return;
            profile.systemPrompt = persona.prompt;
            saveProfiles();
            populateSettingsForm();
            showToast(`${persona.name} persona applied.`);
        };
    }

    function renderStorage(body) {
        body.innerHTML = `
            <div class="nai-card">
                <h3>Workspace backup</h3>
                <div class="nai-muted" style="margin-bottom:12px">Export and restore conversations without touching API settings.</div>
                <div class="nai-toolbar">
                    <button class="nai-primary" data-storage="export">Export all chats</button>
                    <button class="nai-mini" data-storage="import">Import chats</button>
                    <button class="nai-mini" data-storage="idb">Sync to IndexedDB</button>
                </div>
            </div>
            <div class="nai-card" style="margin-top:12px">
                <h3>IndexedDB</h3>
                <div class="nai-muted">A local browser database mirror is maintained as a safety net for larger chat histories. LocalStorage remains the compatibility source for the existing app.</div>
            </div>
        `;
        body.onclick = event => {
            const action = event.target.closest("[data-storage]")?.dataset.storage;
            if (action === "export") exportAllChats();
            if (action === "import") openImportPicker();
            if (action === "idb") { syncChatsToIndexedDB(); showToast("IndexedDB sync started."); }
        };
    }

    function openCompareModal() {
        closeNaiModal();
        const eligible = state.profiles.filter(p => p.enabled && p.apiUrl && p.model);
        const backdrop = document.createElement("div");
        backdrop.className = "nai-modal-backdrop";
        backdrop.id = "naiCompareModal";
        backdrop.innerHTML = `
            <section class="nai-modal" role="dialog" aria-modal="true">
                <header class="nai-modal-head"><div><div class="nai-modal-title">Compare Models</div><div class="nai-modal-sub">Send one prompt to multiple enabled profiles.</div></div><button class="nai-close" data-compare-close>×</button></header>
                <div class="nai-modal-body">
                    <div class="nai-field"><label>Prompt</label><textarea id="naiComparePrompt" placeholder="Ask the same question to several models..."></textarea></div>
                    <div class="nai-field"><label>Profiles</label><div>${eligible.map(p=>`<label style="display:flex;gap:8px;align-items:center;padding:6px 0;font-size:11px"><input type="checkbox" value="${p.id}" checked> ${escapeHtml(p.name)} · ${escapeHtml(p.model)}</label>`).join("")}</div></div>
                    <button class="nai-primary" id="naiCompareRun">Run comparison</button>
                    <div id="naiCompareResults" class="nai-compare-grid" style="margin-top:14px"></div>
                </div>
            </section>
        `;
        document.body.appendChild(backdrop);
        backdrop.addEventListener("click", event => {
            if (event.target === backdrop || event.target.closest("[data-compare-close]")) closeNaiModal();
            if (event.target.closest("#naiCompareRun")) runComparison(backdrop);
        });
    }

    async function runComparison(backdrop) {
        const prompt = $("#naiComparePrompt", backdrop).value.trim();
        const ids = $$("input[type=checkbox]:checked", backdrop).map(input => input.value);
        const profiles = state.profiles.filter(p => ids.includes(p.id));
        const results = $("#naiCompareResults", backdrop);
        if (!prompt || !profiles.length) return showToast("Enter a prompt and select at least one profile.");
        results.innerHTML = profiles.map(p => `<div class="nai-compare-card"><h3>${escapeHtml(p.name)}</h3><div class="nai-muted">${escapeHtml(p.model)}</div><p>Generating…</p></div>`).join("");
        await Promise.all(profiles.map(async (profile, index) => {
            const card = results.children[index];
            const started = performance.now();
            try {
                const response = await fetch(profile.apiUrl, {
                    method:"POST",
                    headers:buildHeaders(profile),
                    body:JSON.stringify({model:profile.model,messages:[{role:"system",content:profile.systemPrompt || DEFAULT_SETTINGS.systemPrompt},{role:"user",content:prompt}],stream:false,temperature:Number(profile.temperature)||.7,max_tokens:Number(profile.maxTokens)||4096})
                });
                const duration = performance.now() - started;
                const text = await safeReadResponseText(response);
                if (!response.ok) throw createApiError(response.status, text);
                const data = JSON.parse(text);
                const content = data?.choices?.[0]?.message?.content ?? data?.message?.content ?? "";
                const usage = data?.usage;
                card.innerHTML = `<h3>${escapeHtml(profile.name)}</h3><div class="nai-muted">${escapeHtml(profile.model)} · ${formatDuration(duration)}${usage?.total_tokens ? ` · ${usage.total_tokens} tokens` : ""}</div><pre>${escapeHtml(typeof content === "string" ? content : JSON.stringify(content,null,2))}</pre>`;
                logApiEvent("compare-success", profile, response.status, duration, "Comparison request succeeded.");
            } catch (error) {
                card.innerHTML = `<h3>${escapeHtml(profile.name)}</h3><div class="nai-muted">${escapeHtml(profile.model)}</div><pre style="color:#fda4af">${escapeHtml(error.message)}</pre>`;
                logApiEvent("compare-error", profile, error.status || 0, performance.now() - started, error.message);
            }
        }));
    }

    function enhanceImageLightbox() {
        $$(".message img", elements.messages).forEach(image => {
            if (image.closest("pre")) return;
            image.dataset.lightboxReady = "true";
            image.style.cursor = "zoom-in";
        });
    }

    function addMessageMetrics() {
        const chat = getCurrentChat();
        if (!chat) return;
        $$(".message.assistant", elements.messages).forEach(article => {
            if (article.querySelector(".nai-metrics")) return;
            const message = chat.messages.find(item => item.id === article.dataset.messageId);
            if (!message) return;
            const metrics = document.createElement("div");
            metrics.className = "nai-metrics nai-muted";
            const parts = [];
            if (message.model) parts.push(message.model);
            if (message.durationMs) parts.push(formatDuration(message.durationMs));
            const totalTokens = message.usage?.total_tokens ?? message.usage?.totalTokens;
            if (totalTokens) parts.push(`${totalTokens} tokens`);
            if (message.profileId) {
                const p = getProfileById(message.profileId);
                if (p) parts.push(p.name);
            }
            if (parts.length) {
                metrics.textContent = parts.join(" · ");
                article.querySelector(".message-body")?.appendChild(metrics);
            }
        });
    }

    function hookRendering() {
        const originalRenderChatList = renderChatList;
        renderChatList = function(...args) {
            const result = originalRenderChatList.apply(this,args);
            ensureChatFields();
            addChatSearch();
            addChatToolsToList();
            renderChatEnhancements();
            return result;
        };

        const originalRenderCurrentChat = renderCurrentChat;
        renderCurrentChat = function(...args) {
            const result = originalRenderCurrentChat.apply(this,args);
            requestAnimationFrame(() => {
                enhanceMessageActions();
                addMessageMetrics();
                enhanceImageLightbox();
            });
            return result;
        };

        const originalGenerate = generateAssistantResponse;
        generateAssistantResponse = async function(chat, ...args) {
            const started = performance.now();
            try {
                const result = await originalGenerate.apply(this, [chat, ...args]);
                const assistant = [...(chat.messages || [])].reverse().find(message => message.role === "assistant");
                if (assistant) {
                    assistant.durationMs = performance.now() - started;
                    if (result?.profile) assistant.profileId = result.profile.id;
                    saveChats();
                    syncChatsToIndexedDB();
                }
                return result;
            } catch (error) {
                const assistant = [...(chat.messages || [])].reverse().find(message => message.role === "assistant");
                const profile = getActiveProfile();
                logApiEvent("generation-error", profile, error.status || 0, performance.now() - started, error.message);
                throw error;
            } finally {
                requestAnimationFrame(() => {
                    enhanceMessageActions();
                    addMessageMetrics();
                });
            }
        };

        const originalPerform = performApiRequest;
        performApiRequest = async function(...args) {
            try {
                return await originalPerform.apply(this, args);
            } catch (error) {
                logApiEvent(
                    "error",
                    getProfileById(state.lastRequestProfileId) || getActiveProfile(),
                    error.status || state.lastRequestStatus || 0,
                    0,
                    error.message
                );
                throw error;
            }
        };
    }

    function setupIndexedDB() {
        if (!("indexedDB" in window)) return;

        const request = indexedDB.open(NAI.dbName, NAI.dbVersion);
        request.onupgradeneeded = event => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(NAI.chatStore)) {
                db.createObjectStore(NAI.chatStore, { keyPath: "id" });
            }
        };
        request.onsuccess = event => {
            const db = event.target.result;
            const transaction = db.transaction(NAI.chatStore, "readonly");
            const store = transaction.objectStore(NAI.chatStore);
            const getAllRequest = store.getAll();

            getAllRequest.onsuccess = () => {
                const indexedChats = Array.isArray(getAllRequest.result)
                    ? getAllRequest.result
                    : [];

                if (state.chats.length === 0 && indexedChats.length > 0) {
                    state.chats = indexedChats;
                    ensureChatFields();
                    state.currentChatId = state.chats[0]?.id || null;
                    renderChatList();
                    renderCurrentChat();
                    showToast("Recovered chats from IndexedDB.");
                } else if (state.chats.length > 0) {
                    syncChatsToIndexedDB();
                }
            };

            getAllRequest.onerror = () => {
                db.close();
            };

            transaction.oncomplete = () => {
                if (db.close) db.close();
            };
        };
    }

    function syncChatsToIndexedDB() {
        if (!("indexedDB" in window)) return;

        const request = indexedDB.open(NAI.dbName, NAI.dbVersion);
        request.onsuccess = event => {
            const db = event.target.result;
            const tx = db.transaction(NAI.chatStore, "readwrite");
            const store = tx.objectStore(NAI.chatStore);
            const clearRequest = store.clear();

            clearRequest.onsuccess = () => {
                state.chats.forEach(chat => store.put(chat));
            };

            tx.oncomplete = () => db.close();
            tx.onerror = () => db.close();
        };
    }

    function hookImageClicks() {
        document.addEventListener("click", event => {
            const image = event.target.closest(".message img");
            if (!image || image.closest("pre")) return;

            event.preventDefault();
            const src = image.currentSrc || image.src;
            if (typeof openImagePreview === "function") {
                openImagePreview(src, image.alt || "Generated image");
            }
        });
    }

    function initEnhancements() {
        injectWorkspaceStyles();
        addSidebarTools();
        addChatSearch();
        addChatToolsToList();
        ensureChatFields();
        hookRendering();
        enhanceImageLightbox();
        hookImageClicks();
        setupIndexedDB();
        requestAnimationFrame(() => {
            renderChatEnhancements();
            enhanceMessageActions();
            addMessageMetrics();
        });
    }

    initEnhancements();
})();


/* ==========================================================================\n   v1.1.3 — Functional Sidebar Navigation\n   Makes Chats, Images, Library and API Profiles real workspace controls.\n   ========================================================================== */
(function setupFunctionalSidebarNavigation() {
    function setActiveNav(button) {
        document.querySelectorAll(".sidebar-nav-item").forEach(item => {
            item.classList.toggle("is-active", item === button);
            item.classList.toggle("active", item === button);
        });
    }

    function scrollToChats() {
        setActiveNav(document.querySelector('.sidebar-nav-item[data-nai-nav="chats"]'));
        elements.chatList?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function collectImages() {
        const results = [];
        const seen = new Set();
        state.chats.forEach(chat => {
            (chat.messages || []).forEach(message => {
                const content = String(message.content || "");
                const markdownMatches = content.match(/!\[[^\]]*\]\(([^)]+)\)/g) || [];
                markdownMatches.forEach(markdown => {
                    const match = markdown.match(/!\[([^\]]*)\]\(([^)]+)\)/);
                    if (!match) return;
                    const src = match[2].trim().replace(/^<|>$/g, "");
                    if (!src || seen.has(src)) return;
                    seen.add(src);
                    results.push({ src, name: match[1] || "Generated image", chatId: chat.id, chatTitle: chat.title || "Untitled" });
                });
                (message.attachments || []).forEach(attachment => {
                    if (!attachment.isImage || !attachment.dataUrl || seen.has(attachment.dataUrl)) return;
                    seen.add(attachment.dataUrl);
                    results.push({ src: attachment.dataUrl, name: attachment.name || "Image", chatId: chat.id, chatTitle: chat.title || "Untitled" });
                });
            });
        });
        return results;
    }

    function collectLibraryFiles() {
        const results = [];
        const seen = new Set();
        state.chats.forEach(chat => {
            (chat.messages || []).forEach(message => {
                (message.attachments || []).forEach(attachment => {
                    const key = `${chat.id}:${attachment.name}:${attachment.size || ""}`;
                    if (seen.has(key)) return;
                    seen.add(key);
                    results.push({
                        name: attachment.name || "Unnamed file",
                        size: attachment.size || 0,
                        isImage: !!attachment.isImage,
                        isText: !!attachment.isText,
                        chatId: chat.id,
                        chatTitle: chat.title || "Untitled"
                    });
                });
            });
        });
        return results;
    }

    function formatFileSize(size) {
        const bytes = Number(size) || 0;
        if (!bytes) return "Size unavailable";
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    function openImagesView() {
        closeNaiModal();
        const images = collectImages();
        const backdrop = document.createElement("div");
        backdrop.className = "nai-modal-backdrop";
        backdrop.id = "naiImagesModal";
        backdrop.innerHTML = `
            <section class="nai-modal" role="dialog" aria-modal="true" aria-label="Images">
                <header class="nai-modal-head">
                    <div><div class="nai-modal-title">Images</div><div class="nai-modal-sub">Generated and attached images from your workspace</div></div>
                    <button class="nai-close" type="button" data-nai-close>×</button>
                </header>
                <div class="nai-modal-body">
                    <div class="nai-image-grid">
                        ${images.length ? images.map((image, index) => `
                            <button class="nai-image-item" type="button" data-image-index="${index}" style="padding:0;text-align:left;color:inherit">
                                <img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.name)}" loading="lazy">
                                <div class="nai-library-meta">
                                    <div class="nai-library-name">${escapeHtml(image.name)}</div>
                                    <div class="nai-library-sub">${escapeHtml(image.chatTitle)}</div>
                                </div>
                            </button>
                        `).join("") : '<div class="nai-nav-empty">No images found in your conversations yet.</div>'}
                    </div>
                </div>
            </section>
        `;
        document.body.appendChild(backdrop);
        backdrop.addEventListener("click", event => {
            if (event.target === backdrop || event.target.closest("[data-nai-close]")) {
                closeNaiModal();
                return;
            }
            const button = event.target.closest("[data-image-index]");
            if (!button) return;
            const image = images[Number(button.dataset.imageIndex)];
            if (image) openImagePreview(image.src, image.name);
        });
    }

    function openLibraryView() {
        closeNaiModal();
        const files = collectLibraryFiles();
        const backdrop = document.createElement("div");
        backdrop.className = "nai-modal-backdrop";
        backdrop.id = "naiLibraryModal";
        backdrop.innerHTML = `
            <section class="nai-modal" role="dialog" aria-modal="true" aria-label="Library">
                <header class="nai-modal-head">
                    <div><div class="nai-modal-title">Library</div><div class="nai-modal-sub">Files and attachments stored in your conversations</div></div>
                    <button class="nai-close" type="button" data-nai-close>×</button>
                </header>
                <div class="nai-modal-body">
                    <div class="nai-library-grid">
                        ${files.length ? files.map(file => `
                            <button class="nai-library-item" type="button" data-chat-id="${escapeHtml(file.chatId)}" style="text-align:left;color:inherit">
                                <div class="nai-library-icon">${file.isImage ? "▧" : file.isText ? "≡" : "□"}</div>
                                <div class="nai-library-name">${escapeHtml(file.name)}</div>
                                <div class="nai-library-sub">${formatFileSize(file.size)} · ${escapeHtml(file.chatTitle)}</div>
                            </button>
                        `).join("") : '<div class="nai-nav-empty">Your file library is empty.</div>'}
                    </div>
                </div>
            </section>
        `;
        document.body.appendChild(backdrop);
        backdrop.addEventListener("click", event => {
            if (event.target === backdrop || event.target.closest("[data-nai-close]")) {
                closeNaiModal();
                return;
            }
            const item = event.target.closest("[data-chat-id]");
            if (!item) return;
            const chat = state.chats.find(entry => entry.id === item.dataset.chatId);
            if (!chat) return;
            state.currentChatId = chat.id;
            renderChatList();
            renderCurrentChat();
            closeNaiModal();
            scrollToChats();
        });
    }

    const navItems = Array.from(document.querySelectorAll(".sidebar-nav-item"));
    if (navItems.length < 4) return;

    navItems[0].dataset.naiNav = "chats";
    navItems[1].dataset.naiNav = "images";
    navItems[2].dataset.naiNav = "library";
    navItems[3].dataset.naiNav = "profiles";

    navItems.forEach(button => {
        button.addEventListener("click", event => {
            const nav = event.currentTarget.dataset.naiNav;
            setActiveNav(event.currentTarget);
            if (nav === "chats") {
                scrollToChats();
            } else if (nav === "images") {
                openImagesView();
            } else if (nav === "library") {
                openLibraryView();
            } else if (nav === "profiles") {
                openControlCenter("profiles");
            }
        });
    });

    setActiveNav(navItems[0]);
})();


/* ==========================================================================\n   v1.3.0 — Projects, Library Workspace & Composer Upgrade\n   ========================================================================== */
(function setupProjectLibraryWorkspace() {
    "use strict";

    const PROJECTS_KEY = "nova_ai_projects_v1";
    const UI_KEY = "nova_ai_workspace_project_ui_v1";

    const readProjects = () => {
        try { return JSON.parse(localStorage.getItem(PROJECTS_KEY) || "[]"); }
        catch { return []; }
    };
    const writeProjects = projects => {
        try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects)); return true; }
        catch { return false; }
    };
    const readUI = () => {
        try { return JSON.parse(localStorage.getItem(UI_KEY) || "{}"); }
        catch { return {}; }
    };
    const writeUI = value => { try { localStorage.setItem(UI_KEY, JSON.stringify(value)); } catch {} };
    const uid = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;

    function ensureProjectFields() {
        state.chats.forEach(chat => { if (!Object.prototype.hasOwnProperty.call(chat, "projectId")) chat.projectId = null; });
    }

    function projectChats(projectId) {
        return state.chats.filter(chat => chat.projectId === projectId);
    }

    function openProjectModal(initialProjectId = null) {
        document.getElementById("naiProjectsModal")?.remove();
        ensureProjectFields();
        const projects = readProjects();
        let selectedId = initialProjectId || readUI().selectedProjectId || projects[0]?.id || null;
        const backdrop = document.createElement("div");
        backdrop.id = "naiProjectsModal";
        backdrop.className = "nai-modal-backdrop nai-projects-modal";
        backdrop.innerHTML = `
            <section class="nai-modal" role="dialog" aria-modal="true" aria-label="Projects">
                <header class="nai-modal-head">
                    <div><div class="nai-modal-title">Projects</div><div class="nai-modal-sub">Organize chats, files and project context in one workspace</div></div>
                    <button class="nai-close" type="button" data-project-close>×</button>
                </header>
                <div class="nai-project-layout">
                    <aside class="nai-project-list">
                        <div class="nai-project-list-head"><strong>Your projects</strong><button class="nai-project-add" type="button" data-project-new>＋ New</button></div>
                        <div data-project-list></div>
                    </aside>
                    <main class="nai-project-detail" data-project-detail></main>
                </div>
            </section>`;
        document.body.appendChild(backdrop);

        const listEl = backdrop.querySelector("[data-project-list]");
        const detailEl = backdrop.querySelector("[data-project-detail]");

        function render() {
            const currentProjects = readProjects();
            if (selectedId && !currentProjects.some(p => p.id === selectedId)) selectedId = currentProjects[0]?.id || null;
            listEl.innerHTML = currentProjects.length ? currentProjects.map(project => {
                const count = projectChats(project.id).length;
                return `<button class="nai-project-entry ${project.id === selectedId ? "active" : ""}" type="button" data-project-select="${escapeHtml(project.id)}">
                    <span class="nai-project-dot" style="background:${escapeHtml(project.color || "#8ab4ff")}"></span>
                    <span class="nai-project-entry-main"><div class="nai-project-entry-name">${escapeHtml(project.name)}</div><div class="nai-project-entry-count">${count} chat${count === 1 ? "" : "s"}</div></span>
                </button>`;
            }).join("") : `<div class="nai-project-empty">No projects yet.<br>Create your first workspace.</div>`;

            const project = currentProjects.find(p => p.id === selectedId);
            if (!project) {
                detailEl.innerHTML = `<div class="nai-project-empty">Select a project or create a new one.</div>`;
                return;
            }
            const chats = projectChats(project.id);
            detailEl.innerHTML = `
                <div class="nai-project-detail-head">
                    <div><div class="nai-project-title">${escapeHtml(project.name)}</div><div class="nai-project-subtitle">${escapeHtml(project.description || "No project description")}</div></div>
                    <div class="nai-project-actions"><button class="nai-project-action" type="button" data-project-add-chat>Add current chat</button><button class="nai-project-action" type="button" data-project-edit>Edit</button><button class="nai-project-action danger" type="button" data-project-delete>Delete</button></div>
                </div>
                <div class="nai-project-card">
                    <div style="font-size:12px;opacity:.6;margin-bottom:9px">PROJECT CHATS</div>
                    ${chats.length ? chats.map(chat => `<div class="nai-project-chat"><div class="nai-project-chat-title">${escapeHtml(chat.title || "Untitled")}</div><button class="nai-project-chat-open" type="button" data-open-chat="${escapeHtml(chat.id)}">Open</button></div>`).join("") : `<div class="nai-project-empty">No chats assigned yet.</div>`}
                </div>
                <div class="nai-project-card">
                    <div style="font-size:12px;opacity:.6;margin-bottom:8px">PROJECT SETTINGS</div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap"><span class="nai-project-badge">${chats.length} chats</span><span class="nai-project-badge">${escapeHtml(project.createdAt ? new Date(project.createdAt).toLocaleDateString() : "Recently created")}</span></div>
                </div>`;
            writeUI({ selectedProjectId: selectedId });
        }

        function showForm(project = null) {
            const editing = !!project;
            detailEl.innerHTML = `<div class="nai-project-form">
                <div><div class="nai-project-title">${editing ? "Edit project" : "Create project"}</div><div class="nai-project-subtitle">Keep a dedicated space for related conversations.</div></div>
                <label>Name<input data-project-name maxlength="80" value="${escapeHtml(project?.name || "")}" placeholder="e.g. AI Chat Development"></label>
                <label>Description<textarea data-project-description maxlength="240" placeholder="What is this project about?">${escapeHtml(project?.description || "")}</textarea></label>
                <label>Color<input data-project-color type="color" value="${escapeHtml(project?.color || "#8ab4ff")}" style="height:42px;padding:5px"></label>
                <div class="nai-project-form-row"><button class="nai-project-action" type="button" data-project-cancel>Cancel</button><button class="nai-project-save" type="button" data-project-save>${editing ? "Save changes" : "Create project"}</button></div>
            </div>`;
            detailEl.querySelector("[data-project-save]").onclick = () => {
                const name = detailEl.querySelector("[data-project-name]").value.trim();
                if (!name) { detailEl.querySelector("[data-project-name]").focus(); return; }
                const all = readProjects();
                const data = { name, description: detailEl.querySelector("[data-project-description]").value.trim(), color: detailEl.querySelector("[data-project-color]").value };
                if (editing) Object.assign(all.find(p => p.id === project.id), data);
                else { const created = { id: uid("project"), ...data, createdAt: Date.now() }; all.unshift(created); selectedId = created.id; }
                writeProjects(all); render();
            };
            detailEl.querySelector("[data-project-cancel]").onclick = render;
        }

        backdrop.addEventListener("click", event => {
            if (event.target === backdrop || event.target.closest("[data-project-close]")) { backdrop.remove(); return; }
            const select = event.target.closest("[data-project-select]");
            if (select) { selectedId = select.dataset.projectSelect; render(); return; }
            if (event.target.closest("[data-project-new]")) { showForm(); return; }
            if (event.target.closest("[data-project-edit]")) { const p = readProjects().find(x => x.id === selectedId); if (p) showForm(p); return; }
            if (event.target.closest("[data-project-delete]")) {
                const p = readProjects().find(x => x.id === selectedId); if (!p) return;
                if (!confirm(`Delete project “${p.name}”? Chats will remain intact.`)) return;
                state.chats.forEach(chat => { if (chat.projectId === p.id) chat.projectId = null; });
                saveChats(); writeProjects(readProjects().filter(x => x.id !== p.id)); selectedId = null; renderChatList(); render(); return;
            }
            if (event.target.closest("[data-project-add-chat]")) {
                const current = state.chats.find(chat => chat.id === state.currentChatId);
                if (!current || !selectedId) return;
                current.projectId = selectedId; saveChats(); renderChatList(); render(); return;
            }
            const open = event.target.closest("[data-open-chat]");
            if (open) { state.currentChatId = open.dataset.openChat; renderChatList(); renderCurrentChat(); backdrop.remove(); }
        });
        render();
    }

    function setupProjectsNav() {
        const nav = document.querySelector(".sidebar-nav");
        const projectButton = document.getElementById("projectsNavButton");
        if (!nav || !projectButton) return;
        projectButton.addEventListener("click", () => openProjectModal());
    }

    function enhanceLibrary() {
        const original = window.__novaLibraryEnhancerInstalled;
        if (original) return;
        window.__novaLibraryEnhancerInstalled = true;
        const observer = new MutationObserver(() => {
            const modal = document.getElementById("naiLibraryModal");
            if (!modal || modal.dataset.enhanced) return;
            modal.dataset.enhanced = "1";
            const body = modal.querySelector(".nai-modal-body");
            const grid = body?.querySelector(".nai-library-grid");
            if (!body || !grid) return;
            const items = Array.from(grid.querySelectorAll(".nai-library-item"));
            const toolbar = document.createElement("div");
            toolbar.className = "nai-library-toolbar";
            toolbar.innerHTML = `<input class="nai-library-search" type="search" placeholder="Search files..." aria-label="Search files"><select class="nai-library-filter"><option value="all">All files</option><option value="image">Images</option><option value="text">Text & code</option><option value="other">Other</option></select>`;
            body.insertBefore(toolbar, grid);
            const filter = () => {
                const q = toolbar.querySelector(".nai-library-search").value.toLowerCase().trim();
                const type = toolbar.querySelector(".nai-library-filter").value;
                items.forEach(item => {
                    const text = item.textContent.toLowerCase();
                    const icon = item.querySelector(".nai-library-icon")?.textContent || "";
                    const typeOk = type === "all" || (type === "image" && icon === "▧") || (type === "text" && icon === "≡") || (type === "other" && icon === "□");
                    item.style.display = typeOk && (!q || text.includes(q)) ? "" : "none";
                });
            };
            toolbar.addEventListener("input", filter); toolbar.addEventListener("change", filter);
        });
        observer.observe(document.body, { childList:true, subtree:true });
    }

    function enhanceComposer() {
        const bottom = document.querySelector(".composer-bottom");
        if (!bottom || bottom.querySelector(".nai-composer-extra")) return;
        const actions = bottom.querySelector(".composer-actions");
        if (!actions) return;
        const wrap = document.createElement("div");
        wrap.className = "nai-composer-extra";
        const modelButton = document.createElement("button");
        modelButton.type = "button";
        modelButton.className = "nai-composer-model";
        const context = document.createElement("span");
        context.className = "nai-composer-context";
        const status = document.createElement("span");
        status.className = "nai-composer-status is-ready";
        status.innerHTML = '<span class="nai-status-dot" aria-hidden="true"></span><span class="nai-status-label">Ready</span>';
        wrap.append(modelButton, context, status);
        actions.prepend(wrap);
        function refresh() {
            const profile = state.profiles.find(p => p.id === state.activeProfileId) || state.profiles.find(p => p.enabled && p.model);
            modelButton.textContent = profile ? `${profile.model || "Model"} · ${profile.name || "Profile"}` : "Select model";
            const chat = state.chats.find(c => c.id === state.currentChatId);
            const messageCount = chat?.messages?.length || 0;
            const tokenCount = (chat?.messages || []).reduce((sum, message) => sum + Number(message.usage?.total_tokens || message.usage?.totalTokens || 0), 0);
            context.textContent = tokenCount ? `${messageCount} messages · ${tokenCount.toLocaleString()} tokens` : `${messageCount} messages`;
            const label = status.querySelector(".nai-status-label");
            if (state.isGenerating) {
                status.className = "nai-composer-status is-working";
                label.textContent = "Generating";
            } else if (!profile) {
                status.className = "nai-composer-status is-warning";
                label.textContent = "No API";
            } else if (profile.cooldownUntil && profile.cooldownUntil > Date.now()) {
                status.className = "nai-composer-status is-warning";
                label.textContent = "Cooldown";
            } else {
                status.className = "nai-composer-status is-ready";
                label.textContent = "Ready";
            }
        }
        modelButton.onclick = () => document.querySelector("[data-nai-model-switcher]")?.click() || openControlCenter("profiles");
        refresh();
        if (!window.__novaComposerRefreshTimer) {
            window.__novaComposerRefreshTimer = setInterval(refresh, 900);
        }
    }

    ensureProjectFields();
    setupProjectsNav();
    enhanceLibrary();
    enhanceComposer();

    const originalCreate = window.createNewChat;
    if (typeof originalCreate === "function") {
        window.createNewChat = function(...args) {
            const result = originalCreate.apply(this, args);
            ensureProjectFields();
            return result;
        };
    }
})();

window.openRequestInspector = openRequestInspector;
