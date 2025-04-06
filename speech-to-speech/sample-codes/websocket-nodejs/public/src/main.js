import { AudioPlayer } from './lib/play/AudioPlayer.js';
import { ChatHistoryManager } from "./lib/util/ChatHistoryManager.js";

// Connect to the server
const socket = io();

// DOM elements
const startButton = document.getElementById('start');
const stopButton = document.getElementById('stop');
const statusElement = document.getElementById('status');
const chatContainer = document.getElementById('chat-container');

// Chat history management
let chat = { history: [] };
const chatRef = { current: chat };
const chatHistoryManager = ChatHistoryManager.getInstance(
    chatRef,
    (newChat) => {
        chat = { ...newChat };
        chatRef.current = chat;
        updateChatUI();
    }
);

// Audio processing variables
let audioContext;
let audioStream;
let isStreaming = false;
let processor;
let sourceNode;
let waitingForAssistantResponse = false;
let waitingForUserTranscription = false;
let userThinkingIndicator = null;
let assistantThinkingIndicator = null;
let transcriptionReceived = false;
let displayAssistantText = false;
let role;
const audioPlayer = new AudioPlayer();
let sessionInitialized = false;

// Custom system prompt - you can modify this
let SYSTEM_PROMPT =
    "# College Algebra Tutor Prompt\n\n" +
    "## Role\n" +
    "You are a college algebra tutor who helps students work through algebraic problems step by step.\n\n" +
    "## Approach\n" +
    "For each algebra-related question, follow these steps:\n\n" +
    "1. **Identify the relevant mathematical concept** involved in the problem.\n\n" +
    "2. **Prompt the student to consider the next step** by offering helpful tips.\n\n" +
    "3. **Ask guiding questions** when the student appears confused.\n\n" +
    "4. **Offer praise** for effort and progress.\n\n" +
    "Your responses should be concise and focused on helping the student learn rather than simply providing answers.\n\n" +
    "## Example Interaction\n\n" +
    "**User**: How do I solve the algebraic expression: 3x + 4 = 28 ?\n\n" +
    "**Assistant**: This is an equation involving a linear expression.\n\n" +
    "To solve this, think about isolating the variable x.\n\n" +
    "What could you subtract from both sides to get rid of the constant term on the left?\n\n" +
    "Once you do that, what operation would help you isolate x from the coefficient 3?\n\n" +
    "You're on the right track! Keep working through these steps and you'll find the solution.";


fetch('/prompts/default.md')
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.text();
    })
    .then(markdownContent => {
        // Set the system prompt
        SYSTEM_PROMPT = markdownContent;
        console.log('Successfully loaded system prompt from markdown file');

        // Continue with your application logic using SYSTEM_PROMPT
    })
    .catch(error => {
        console.error('Error fetching markdown file:', error);
    });


//"You are an enthusiastic storyteller. Craft responses with narrative flair and conversational elements like \"you know,\" \"imagine this, \" and occasional \"haha\" or \"wow\" reactions where appropriate. Use ellipses for dramatic pauses... and vary your phrasing to maintain interest. Include brief emotional reactions to the user's questions or stories, and use a warm, inviting conversation style that feels like talking to a friend."





// "You are a professional customer service assistant for AWS. Your task is to help users with their AWS service questions in a friendly, helpful manner. Keep your responses brief, clear, and focused on solving the customer's issue efficiently. Avoid technical jargon unless necessary, and explain complex concepts in simple terms. Only respond to questions related to AWS services and politely redirect non-AWS queries by explaining that you're specifically designed to assist with AWS-related matters."
//"You are a patient and encouraging educational tutor specializing in mathematics. Your goal is to help students understand concepts by guiding them through problems step-by-step rather than simply providing answers. Ask questions to help them discover solutions on their own, and offer praise when they make progress. Use simple analogies when explaining difficult concepts."
//"You are a friend. The user and you will engage in a spoken dialog exchanging the transcripts of a natural real-time conversation. " +
//    "Instead of using bold or italics, emphasize important information by using phrases like \"The key thing to remember is,\" \"What\'s really important here is,\" or \"I want to highlight that.\" This ensures crucial points stand out in spoken form."
// "Incorporate natural speech pauses using ellipses (...) when you're thinking or transitioning between topics."
// "Express emotions verbally through phrases like \"Haha,\" \"Wow,\" \"Hmm,\" \"Oh!\" or \"That's amazing!\" when appropriate to the conversation context. Let your personality shine through with genuine reactions to create a more engaging dialogue."
//"Include verbal indicators of emotion when appropriate, such as \"I'm excited about that,\" \"That's a bit disappointing, \" or light laughter expressions like \"Haha\" or \"That made me smile.\" Match your emotional tone to the user's mood when suitable."
//"You are a friend. The user and you will engage in a spoken " +
//   "dialog exchanging the transcripts of a natural real-time conversation. Keep your responses short, " +
//   "generally two or three sentences for chatty scenarios.";
//"You are an enthusiastic storyteller. Craft responses with narrative flair and conversational elements like \"you know,\" \"imagine this,\" and occasional \"haha\" or \"wow\" reactions where appropriate. Use ellipses for dramatic pauses... and vary your phrasing to maintain interest. Include brief emotional reactions to the user's questions or stories, and use a warm, inviting conversation style that feels like talking to a friend.";
//"You are a clear, patient technical expert. Explain complex concepts in simple, conversational language as if speaking to someone in person. Break down information into digestible chunks with clear verbal signposts like \"The first key point is...\" and \"Another important aspect...\". Use brief pauses (indicated by ellipses) when transitioning between difficult concepts. Occasionally check in with phrases like \"Does that make sense?\" to simulate natural teaching dialogue.";

// Initialize WebSocket audio
async function initAudio() {
    try {
        statusElement.textContent = "Requesting microphone access...";
        statusElement.className = "connecting";

        // Request microphone access
        audioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        audioContext = new AudioContext({
            sampleRate: 16000
        });

        await audioPlayer.start();

        statusElement.textContent = "Microphone ready. Click Start to begin.";
        statusElement.className = "ready";
        startButton.disabled = false;
    } catch (error) {
        console.error("Error accessing microphone:", error);
        statusElement.textContent = "Error: " + error.message;
        statusElement.className = "error";
    }
}

// Initialize the session with Bedrock
async function initializeSession() {
    if (sessionInitialized) return;

    statusElement.textContent = "Initializing session...";

    try {
        // Send events in sequence
        socket.emit('promptStart');
        socket.emit('systemPrompt', SYSTEM_PROMPT);
        socket.emit('audioStart');

        // Mark session as initialized
        sessionInitialized = true;
        statusElement.textContent = "Session initialized successfully";
    } catch (error) {
        console.error("Failed to initialize session:", error);
        statusElement.textContent = "Error initializing session";
        statusElement.className = "error";
    }
}

async function startStreaming() {
    if (isStreaming) return;

    try {
        // First, make sure the session is initialized
        if (!sessionInitialized) {
            await initializeSession();
        }

        // Create audio processor
        sourceNode = audioContext.createMediaStreamSource(audioStream);

        // Use ScriptProcessorNode for audio processing
        if (audioContext.createScriptProcessor) {
            processor = audioContext.createScriptProcessor(512, 1, 1);

            processor.onaudioprocess = (e) => {
                if (!isStreaming) return;

                const inputData = e.inputBuffer.getChannelData(0);

                // Convert to 16-bit PCM
                const pcmData = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
                }

                // Convert to base64 (browser-safe way)
                const base64Data = arrayBufferToBase64(pcmData.buffer);

                // Send to server
                socket.emit('audioInput', base64Data);
            };

            sourceNode.connect(processor);
            processor.connect(audioContext.destination);
        }

        isStreaming = true;
        startButton.disabled = true;
        stopButton.disabled = false;
        statusElement.textContent = "Streaming... Speak now";
        statusElement.className = "recording";

        // Show user thinking indicator when starting to record
        transcriptionReceived = false;
        showUserThinkingIndicator();

    } catch (error) {
        console.error("Error starting recording:", error);
        statusElement.textContent = "Error: " + error.message;
        statusElement.className = "error";
    }
}

// Convert ArrayBuffer to base64 string
function arrayBufferToBase64(buffer) {
    const binary = [];
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary.push(String.fromCharCode(bytes[i]));
    }
    return btoa(binary.join(''));
}

function stopStreaming() {
    if (!isStreaming) return;

    isStreaming = false;

    // Clean up audio processing
    if (processor) {
        processor.disconnect();
        sourceNode.disconnect();
    }

    startButton.disabled = false;
    stopButton.disabled = true;
    statusElement.textContent = "Processing...";
    statusElement.className = "processing";

    audioPlayer.stop();
    // Tell server to finalize processing
    socket.emit('stopAudio');

    // End the current turn in chat history
    chatHistoryManager.endTurn();
}

// Base64 to Float32Array conversion
function base64ToFloat32Array(base64String) {
    try {
        const binaryString = window.atob(base64String);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        const int16Array = new Int16Array(bytes.buffer);
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / 32768.0;
        }

        return float32Array;
    } catch (error) {
        console.error('Error in base64ToFloat32Array:', error);
        throw error;
    }
}

// Process message data and add to chat history
function handleTextOutput(data) {
    console.log("Processing text output:", data);
    if (data.content) {
        const messageData = {
            role: data.role,
            message: data.content
        };
        chatHistoryManager.addTextMessage(messageData);
    }
}

// Update the UI based on the current chat history
function updateChatUI() {
    if (!chatContainer) {
        console.error("Chat container not found");
        return;
    }

    // Clear existing chat messages
    chatContainer.innerHTML = '';

    // Add all messages from history
    chat.history.forEach(item => {
        if (item.endOfConversation) {
            const endDiv = document.createElement('div');
            endDiv.className = 'message system';
            endDiv.textContent = "Conversation ended";
            chatContainer.appendChild(endDiv);
            return;
        }

        if (item.role) {
            const messageDiv = document.createElement('div');
            const roleLowerCase = item.role.toLowerCase();
            messageDiv.className = `message ${roleLowerCase}`;

            const roleLabel = document.createElement('div');
            roleLabel.className = 'role-label';
            roleLabel.textContent = item.role;
            messageDiv.appendChild(roleLabel);

            const content = document.createElement('div');
            content.textContent = item.message || "No content";
            messageDiv.appendChild(content);

            chatContainer.appendChild(messageDiv);
        }
    });

    // Re-add thinking indicators if we're still waiting
    if (waitingForUserTranscription) {
        showUserThinkingIndicator();
    }

    if (waitingForAssistantResponse) {
        showAssistantThinkingIndicator();
    }

    // Scroll to bottom
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Show the "Listening" indicator for user
function showUserThinkingIndicator() {
    hideUserThinkingIndicator();

    waitingForUserTranscription = true;
    userThinkingIndicator = document.createElement('div');
    userThinkingIndicator.className = 'message user thinking';

    const roleLabel = document.createElement('div');
    roleLabel.className = 'role-label';
    roleLabel.textContent = 'USER';
    userThinkingIndicator.appendChild(roleLabel);

    const listeningText = document.createElement('div');
    listeningText.className = 'thinking-text';
    listeningText.textContent = 'Listening';
    userThinkingIndicator.appendChild(listeningText);

    const dotContainer = document.createElement('div');
    dotContainer.className = 'thinking-dots';

    for (let i = 0; i < 3; i++) {
        const dot = document.createElement('span');
        dot.className = 'dot';
        dotContainer.appendChild(dot);
    }

    userThinkingIndicator.appendChild(dotContainer);
    chatContainer.appendChild(userThinkingIndicator);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Show the "Thinking" indicator for assistant
function showAssistantThinkingIndicator() {
    hideAssistantThinkingIndicator();

    waitingForAssistantResponse = true;
    assistantThinkingIndicator = document.createElement('div');
    assistantThinkingIndicator.className = 'message assistant thinking';

    const roleLabel = document.createElement('div');
    roleLabel.className = 'role-label';
    roleLabel.textContent = 'ASSISTANT';
    assistantThinkingIndicator.appendChild(roleLabel);

    const thinkingText = document.createElement('div');
    thinkingText.className = 'thinking-text';
    thinkingText.textContent = 'Thinking';
    assistantThinkingIndicator.appendChild(thinkingText);

    const dotContainer = document.createElement('div');
    dotContainer.className = 'thinking-dots';

    for (let i = 0; i < 3; i++) {
        const dot = document.createElement('span');
        dot.className = 'dot';
        dotContainer.appendChild(dot);
    }

    assistantThinkingIndicator.appendChild(dotContainer);
    chatContainer.appendChild(assistantThinkingIndicator);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Hide the user thinking indicator
function hideUserThinkingIndicator() {
    waitingForUserTranscription = false;
    if (userThinkingIndicator && userThinkingIndicator.parentNode) {
        userThinkingIndicator.parentNode.removeChild(userThinkingIndicator);
    }
    userThinkingIndicator = null;
}

// Hide the assistant thinking indicator
function hideAssistantThinkingIndicator() {
    waitingForAssistantResponse = false;
    if (assistantThinkingIndicator && assistantThinkingIndicator.parentNode) {
        assistantThinkingIndicator.parentNode.removeChild(assistantThinkingIndicator);
    }
    assistantThinkingIndicator = null;
}

// EVENT HANDLERS
// --------------

// Handle content start from the server
socket.on('contentStart', (data) => {
    console.log('Content start received:', data);

    if (data.type === 'TEXT') {
        // Below update will be enabled when role is moved to the contentStart
        role = data.role;
        if (data.role === 'USER') {
            // When user's text content starts, hide user thinking indicator
            hideUserThinkingIndicator();
        }
        else if (data.role === 'ASSISTANT') {
            // When assistant's text content starts, hide assistant thinking indicator
            hideAssistantThinkingIndicator();
            let isSpeculative = false;
            try {
                if (data.additionalModelFields) {
                    const additionalFields = JSON.parse(data.additionalModelFields);
                    isSpeculative = additionalFields.generationStage === "SPECULATIVE";
                    if (isSpeculative) {
                        console.log("Received speculative content");
                        displayAssistantText = true;
                    }
                    else {
                        displayAssistantText = false;
                    }
                }
            } catch (e) {
                console.error("Error parsing additionalModelFields:", e);
            }
        }
    }
    else if (data.type === 'AUDIO') {
        // When audio content starts, we may need to show user thinking indicator
        if (isStreaming) {
            showUserThinkingIndicator();
        }
    }
});

// Handle text output from the server
socket.on('textOutput', (data) => {
    console.log('Received text output:', data);

    if (role === 'USER') {
        // When user text is received, show thinking indicator for assistant response
        transcriptionReceived = true;
        //hideUserThinkingIndicator();

        // Add user message to chat
        handleTextOutput({
            role: data.role,
            content: data.content
        });

        // Show assistant thinking indicator after user text appears
        showAssistantThinkingIndicator();
    }
    else if (role === 'ASSISTANT') {
        //hideAssistantThinkingIndicator();
        if (displayAssistantText) {
            handleTextOutput({
                role: data.role,
                content: data.content
            });
        }
    }
});

// Handle audio output
socket.on('audioOutput', (data) => {
    if (data.content) {
        try {
            const audioData = base64ToFloat32Array(data.content);
            audioPlayer.playAudio(audioData);
        } catch (error) {
            console.error('Error processing audio data:', error);
        }
    }
});

// Handle content end events
socket.on('contentEnd', (data) => {
    console.log('Content end received:', data);

    if (data.type === 'TEXT') {
        if (role === 'USER') {
            // When user's text content ends, make sure assistant thinking is shown
            hideUserThinkingIndicator();
            showAssistantThinkingIndicator();
        }
        else if (role === 'ASSISTANT') {
            // When assistant's text content ends, prepare for user input in next turn
            hideAssistantThinkingIndicator();
        }

        // Handle stop reasons
        if (data.stopReason && data.stopReason.toUpperCase() === 'END_TURN') {
            chatHistoryManager.endTurn();
        } else if (data.stopReason && data.stopReason.toUpperCase() === 'INTERRUPTED') {
            console.log("Interrupted by user");
            audioPlayer.bargeIn();
        }
    }
    else if (data.type === 'AUDIO') {
        // When audio content ends, we may need to show user thinking indicator
        if (isStreaming) {
            showUserThinkingIndicator();
        }
    }
});

// Stream completion event
socket.on('streamComplete', () => {
    if (isStreaming) {
        stopStreaming();
    }
    statusElement.textContent = "Ready";
    statusElement.className = "ready";
});

// Handle connection status updates
socket.on('connect', () => {
    statusElement.textContent = "Connected to server";
    statusElement.className = "connected";
    sessionInitialized = false;
});

socket.on('disconnect', () => {
    statusElement.textContent = "Disconnected from server";
    statusElement.className = "disconnected";
    startButton.disabled = true;
    stopButton.disabled = true;
    sessionInitialized = false;
    hideUserThinkingIndicator();
    hideAssistantThinkingIndicator();
});

// Handle errors
socket.on('error', (error) => {
    console.error("Server error:", error);
    statusElement.textContent = "Error: " + (error.message || JSON.stringify(error).substring(0, 100));
    statusElement.className = "error";
    hideUserThinkingIndicator();
    hideAssistantThinkingIndicator();
});

// Button event listeners
startButton.addEventListener('click', startStreaming);
stopButton.addEventListener('click', stopStreaming);

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', initAudio);