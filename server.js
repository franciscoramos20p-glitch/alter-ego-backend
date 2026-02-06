import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import { createClient } from '@deepgram/sdk';
import stringSimilarity from 'string-similarity';

// =============================================================
// 🏗️ CONFIGURACIÓN DEL SISTEMA
// =============================================================
dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

// Inicialización
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

const APP_INTERNAL_KEY = "AlterEgo_Secure_2026_X9";

console.log(`\n🔴 SERVIDOR V140 (ANTI-CRASH) ONLINE: ${PORT}`);
console.log(`🛡️ LOGS DE ERROR ACTIVOS\n`);

// Mapeo de voces
const VOICE_MAP = {
    "alloy": "aura-orion-en",
    "echo": "aura-arcas-en",
    "fable": "aura-athena-en",
    "onyx": "aura-perseus-en",
    "nova": "aura-asteria-en",
    "shimmer": "aura-luna-en"
};

// Palabras prohibidas
const BLACKLIST = [
    "Subtitles by", "Amara.org", "Translated by", "watching",
    "999", "1234", "00:00", ". . .", "...", "video playback"
];

// Función Anti-Loro
function isEcho(text1, text2) {
    if (!text1 || !text2) return false;
    return stringSimilarity.compareTwoStrings(text1.toLowerCase(), text2.toLowerCase()) > 0.80;
}

// Limpieza de respuesta
function cleanResponse(text) {
    if (!text) return "";
    return text.replace(/Translation:/gi, "").replace(/Here is:/gi, "").replace(/"/g, "").trim();
}

// Mantener conexión
const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);
wss.on('close', () => clearInterval(pingInterval));

// =============================================================
// 🔌 WEBSOCKET
// =============================================================
wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.lastMessageTime = 0;
    
    console.log(`⚡ Cliente Nuevo: ${req.socket.remoteAddress}`);
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (message) => {
        try {
            const now = Date.now();
            if (now - ws.lastMessageTime < 50) return;
            ws.lastMessageTime = now;

            let data;
            try { data = JSON.parse(message); } catch (e) { return; }

            // AUTH
            if (data.type === 'auth') {
                if (data.token !== APP_INTERNAL_KEY) {
                    console.log("⛔ Auth Fallida");
                    ws.close();
                } else {
                    ws.send(JSON.stringify({ type: 'auth_success' }));
                }
                return;
            }

            const langA = data.langSource || "Spanish";
            const langB = data.langTarget || "English";
            const isFastMode = data.fastMode === true;
            const targetVoiceModel = VOICE_MAP[data.voice || "nova"] || "aura-asteria-en";

            // =================================================================
            // 🎙️ AUDIO INPUT (AQUÍ ESTABA EL ERROR)
            // =================================================================
            if (data.type === 'audio_input') {
                if (!data.payload) return;
                const audioBuffer = Buffer.from(data.payload, 'base64');

                try {
                    // 1. TRANSCRIPCIÓN
                    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
                        audioBuffer,
                        { model: "nova-2", smart_format: true, detect_language: true, punctuate: true }
                    );

                    if (error) throw new Error("STT Failed");

                    // EXTRAEMOS LOS DATOS (¡CON SEGURIDAD!)
                    const channel = result?.results?.channels?.[0]?.alternatives?.[0];
                    let userText = channel?.transcript?.trim();
                    
                    // 🔥 CORRECCIÓN DEL CRASH: Si detected_language es undefined, usamos 'unknown'
                    let detectedCode = channel?.detected_language || "unknown";

                    if (!userText || userText.length < 2) return;
                    if (BLACKLIST.some(t => userText.includes(t))) return;

                    console.log(`🗣️ In: "${userText}" [Code: ${detectedCode}]`);

                    // 2. LÓGICA DE DIRECCIÓN (SEGURA)
                    // Si Deepgram falla (unknown), asumimos que el usuario habló en el idioma A (langA)
                    // y traducimos al idioma B. ¡Así nunca se detiene!
                    
                    let directionPrompt = "";
                    
                    if (detectedCode.startsWith('es')) {
                        // Si se detectó español, traducir al OTRO idioma
                         directionPrompt = `TRANSLATE FROM SPANISH TO ${langB.toUpperCase()}.`;
                    } else if (detectedCode.startsWith('en')) {
                        // Si se detectó inglés, traducir al OTRO idioma
                         directionPrompt = `TRANSLATE FROM ENGLISH TO ${langA.toUpperCase()}.`;
                    } else {
                        // ⚠️ SI NO SE DETECTA NADA O ES OTRO IDIOMA
                        // Forzamos traducción cruzada basada en la configuración del usuario
                         directionPrompt = `DETECT LANGUAGE OF INPUT. IF IT IS ${langA.toUpperCase()}, TRANSLATE TO ${langB.toUpperCase()}. IF IT IS ${langB.toUpperCase()}, TRANSLATE TO ${langA.toUpperCase()}.`;
                    }

                    // 3. TRADUCCIÓN ESTRICTA
                    const systemPrompt = `
                    ROLE: API TRANSLATOR.
                    TASK: ${directionPrompt}
                    INPUT: "${userText}"
                    
                    STRICT RULES:
                    - OUTPUT ONLY THE TRANSLATED TEXT.
                    - NO CONVERSATION. (Input: "Hola" -> Output: "Hello". NOT "Hola, ¿cómo estás?").
                    - DO NOT ANSWER QUESTIONS.
                    `;

                    const completion = await groq.chat.completions.create({
                        messages: [{ role: "system", content: systemPrompt }],
                        model: "llama-3.1-8b-instant",
                        temperature: 0.0,
                        max_tokens: 256
                    });

                    let aiText = cleanResponse(completion.choices[0].message.content);

                    // Filtro Anti-Loro
                    if (isEcho(userText, aiText)) {
                        console.log("⚠️ Eco detectado. Ignorando.");
                        return;
                    }
                    if (!aiText || aiText === "SILENCE") return;

                    console.log(`✅ Out: "${aiText}"`);
                    ws.lastAiResponse = aiText;

                    // 4. AUDIO (Si no es flash)
                    let audioB64 = null;
                    if (!isFastMode) {
                        try {
                            const response = await fetch(`https://api.deepgram.com/v1/speak?model=${targetVoiceModel}`, {
                                method: 'POST',
                                headers: { 'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`, 'Content-Type': 'application/json' },
                                body: JSON.stringify({ text: aiText })
                            });
                            if (response.ok) {
                                const ab = await response.arrayBuffer();
                                audioB64 = Buffer.from(ab).toString('base64');
                            }
                        } catch (e) { console.error("TTS Error", e.message); }
                    }

                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: userText, 
                        ai_text: aiText, 
                        audio: audioB64 
                    }));

                } catch (e) { console.error("❌ Audio Error:", e.message); }
            }

            // =================================================================
            // 📝 TEXT INPUT (CHAT)
            // =================================================================
            else if (data.type === 'text_input') {
                try {
                    console.log(`📝 Texto: "${data.text}"`);
                    
                    const systemPrompt = `
                    ROLE: TRANSLATION ENGINE.
                    TASK: Translate input to the OTHER language between (${langA} and ${langB}).
                    INPUT: "${data.text}"
                    RULES: OUTPUT ONLY TRANSLATION. NO CHAT.
                    `;

                    const stream = await groq.chat.completions.create({
                        messages: [{ role: "system", content: systemPrompt }],
                        model: "llama-3.1-8b-instant",
                        temperature: 0.0,
                        stream: true
                    });

                    let fullText = "";
                    for await (const chunk of stream) {
                        const content = chunk.choices[0]?.delta?.content || "";
                        if (content) {
                            fullText += content;
                            ws.send(JSON.stringify({ type: 'stream_chunk', token: content }));
                        }
                    }
                    ws.lastAiResponse = fullText;

                    let audioB64 = null;
                    if (fullText && !isFastMode) {
                         const response = await fetch(`https://api.deepgram.com/v1/speak?model=${targetVoiceModel}`, {
                            method: 'POST',
                            headers: { 'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ text: fullText })
                        });
                        if (response.ok) {
                            const ab = await response.arrayBuffer();
                            audioB64 = Buffer.from(ab).toString('base64');
                        }
                    }

                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: data.text, 
                        ai_text: fullText, 
                        audio: audioB64 
                    }));

                } catch(e) { console.error("Texto Error:", e.message); }
            }

        } catch (e) { console.error("WS Main Error:", e.message); }
    });
});