import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import { createClient } from '@deepgram/sdk';
import stringSimilarity from 'string-similarity';

// Configuración
dotenv.config();
const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

// Motores
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
const APP_INTERNAL_KEY = "AlterEgo_Secure_2026_X9";

console.log(`\n🔴 SERVIDOR V150 (ANTI-CRASH FIXED) ONLINE: ${PORT}\n`);

// Voces
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
    "Subtitles by", "Amara.org", "Translated by", "999", "1234", "00:00", "..."
];

// Detección de eco (Loro)
function isEcho(text1, text2) {
    if (!text1 || !text2) return false;
    return stringSimilarity.compareTwoStrings(text1.toLowerCase(), text2.toLowerCase()) > 0.85;
}

// Limpieza agresiva de respuestas
function cleanResponse(text) {
    if (!text) return "";
    return text
        .replace(/Translation:/gi, "")
        .replace(/Here is:/gi, "")
        .replace(/["()]/g, "") // Quita comillas y paréntesis
        .trim();
}

// Mantener conexión viva
const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);
wss.on('close', () => clearInterval(pingInterval));

// =============================================================
// 🔌 WEBSOCKET CORE
// =============================================================
wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.lastMessageTime = 0;
    
    console.log(`⚡ Cliente: ${req.socket.remoteAddress}`);
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (message) => {
        try {
            const now = Date.now();
            if (now - ws.lastMessageTime < 50) return;
            ws.lastMessageTime = now;

            let data;
            try { data = JSON.parse(message); } catch (e) { return; }

            if (data.type === 'auth') {
                if (data.token !== APP_INTERNAL_KEY) ws.close();
                else ws.send(JSON.stringify({ type: 'auth_success' }));
                return;
            }

            const langA = data.langSource || "Spanish";
            const langB = data.langTarget || "English";
            const isFastMode = data.fastMode === true;
            const targetVoiceModel = VOICE_MAP[data.voice || "nova"] || "aura-asteria-en";

            // 🎙️ AUDIO INPUT
            if (data.type === 'audio_input') {
                if (!data.payload) return;
                const audioBuffer = Buffer.from(data.payload, 'base64');

                try {
                    // 1. Transcripción Deepgram
                    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
                        audioBuffer,
                        { model: "nova-2", smart_format: true, detect_language: true, punctuate: true }
                    );

                    if (error) throw new Error("STT Falló");

                    const channel = result?.results?.channels?.[0]?.alternatives?.[0];
                    let userText = channel?.transcript?.trim();
                    
                    // 🔥 AQUÍ ESTÁ EL ARREGLO DEL CRASH 🔥
                    // Si detected_language es undefined, le ponemos "unknown" para que .startsWith no explote
                    let rawDetected = channel?.detected_language;
                    let detectedCode = rawDetected ? rawDetected.toLowerCase() : "unknown";

                    if (!userText || userText.length < 2) return;
                    if (BLACKLIST.some(t => userText.includes(t))) return;

                    console.log(`🗣️ In: "${userText}" [Lenguaje: ${detectedCode}]`);

                    // 2. Lógica de Dirección Inteligente (Anti-Error)
                    let promptInstruction = "";
                    
                    if (detectedCode.startsWith('es')) {
                        // Detectó Español -> Traducir a Idioma B
                        promptInstruction = `TRANSLATE FROM SPANISH TO ${langB.toUpperCase()}.`;
                    } else if (detectedCode.startsWith('en')) {
                        // Detectó Inglés -> Traducir a Idioma A
                        promptInstruction = `TRANSLATE FROM ENGLISH TO ${langA.toUpperCase()}.`;
                    } else {
                        // NO DETECTÓ NADA (Unknown): Usamos lógica de "Espejo"
                        // "Si parece A traduce a B, si parece B traduce a A"
                        promptInstruction = `
                        TASK: Determine if input is ${langA} or ${langB}.
                        - IF INPUT IS ${langA.toUpperCase()} -> TRANSLATE TO ${langB.toUpperCase()}.
                        - IF INPUT IS ${langB.toUpperCase()} -> TRANSLATE TO ${langA.toUpperCase()}.
                        `;
                    }

                    // 3. Traducción (Cero Charla)
                    const completion = await groq.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `
                                ROLE: TRANSLATION API (STRICT).
                                COMMAND: ${promptInstruction}
                                INPUT TEXT: "${userText}"
                                
                                RULES:
                                1. OUTPUT ONLY THE TRANSLATED TEXT. NO EXPLANATIONS.
                                2. DO NOT ANSWER. (Example: "Why?" -> "Por qué?". NOT "Because...").
                                3. IF INPUT IS NONSENSE, OUTPUT "SILENCE".
                                `
                            }
                        ],
                        model: "llama-3.1-8b-instant",
                        temperature: 0.0,
                        max_tokens: 256
                    });

                    let aiText = cleanResponse(completion.choices[0].message.content);

                    if (isEcho(userText, aiText)) return; // Bloqueo de Loro
                    if (!aiText || aiText === "SILENCE") return;

                    console.log(`✅ Out: "${aiText}"`);
                    ws.lastAiResponse = aiText;

                    // 4. Voz (TTS)
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
                        } catch (e) {}
                    }

                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: userText, 
                        ai_text: aiText, 
                        audio: audioB64 
                    }));

                } catch (e) { console.error("Error Audio:", e.message); }
            }

            // 📝 TEXT INPUT (Chat escrito)
            else if (data.type === 'text_input') {
                try {
                    console.log(`📝 Texto: "${data.text}"`);
                    
                    const stream = await groq.chat.completions.create({
                        messages: [{ 
                            role: "system", 
                            content: `
                            TASK: Translate "${data.text}" from ${langA} to ${langB} (or vice versa).
                            RULES: OUTPUT ONLY TRANSLATION. NO CHAT.
                            ` 
                        }],
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

                } catch(e) { console.error("Error Texto:", e.message); }
            }

        } catch (e) { console.error("WS Error:", e.message); }
    });
});