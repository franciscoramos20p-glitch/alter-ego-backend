import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import { createClient } from '@deepgram/sdk';
import stringSimilarity from 'string-similarity';

// =============================================================
// 🏗️ CONFIGURACIÓN DEL SERVIDOR (CORE)
// =============================================================
dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

// Inicialización de Motores Neuronales
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

const APP_INTERNAL_KEY = "AlterEgo_Secure_2026_X9";

console.log(`\n🔴 SERVIDOR V130 (ESTRICTO/MILITAR) INICIADO EN PUERTO: ${PORT}`);
console.log(`🛡️ SISTEMA ANTI-CHAT: ACTIVADO`);
console.log(`⚡ MODO FLASH/HQ: LISTO\n`);

// =============================================================
// 🧠 BASES DE DATOS Y UTILIDADES
// =============================================================

// Mapeo de voces Frontend -> Backend
const VOICE_MAP = {
    "alloy": "aura-orion-en",
    "echo": "aura-arcas-en",
    "fable": "aura-athena-en",
    "onyx": "aura-perseus-en",
    "nova": "aura-asteria-en",
    "shimmer": "aura-luna-en"
};

// Palabras prohibidas (Alucinaciones técnicas)
const BLACKLIST = [
    "Subtitles by", "Amara.org", "Translated by", "watching",
    "Please subscribe", "sous-titres", "captioned", "999", "1234",
    "00:00", ". . .", "...", "video playback"
];

// Función Matemática: Detecta si el texto A es igual al B (Efecto Loro)
function isEcho(text1, text2) {
    if (!text1 || !text2) return false;
    // Si la similitud es mayor al 80%, es un loro.
    return stringSimilarity.compareTwoStrings(text1.toLowerCase(), text2.toLowerCase()) > 0.80;
}

// Limpieza de texto agresiva
function cleanResponse(text) {
    if (!text) return "";
    return text
        .replace(/Translation:/gi, "")
        .replace(/Here is:/gi, "")
        .replace(/"/g, "")
        .replace(/\(.*\)/g, "") // Elimina notas entre paréntesis
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
// 🔌 LÓGICA DE WEBSOCKET (EL CEREBRO)
// =============================================================
wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.lastMessageTime = 0;

    console.log(`⚡ Nuevo Cliente: ${req.socket.remoteAddress}`);

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (message) => {
        try {
            // 1. Control de Flujo (Anti-Saturación)
            const now = Date.now();
            if (now - ws.lastMessageTime < 50) return;
            ws.lastMessageTime = now;

            let data;
            try { data = JSON.parse(message); } catch (e) { return; }

            // 2. Seguridad (Auth)
            if (data.type === 'auth') {
                if (data.token !== APP_INTERNAL_KEY) {
                    console.log("⛔ Cliente rechazado: Token inválido");
                    ws.close();
                } else {
                    ws.send(JSON.stringify({ type: 'auth_success' }));
                }
                return;
            }

            // Extracción de Variables de la App
            const langA = data.langSource || "Spanish";
            const langB = data.langTarget || "English";
            const isFastMode = data.fastMode === true; // ¿Rayo Amarillo?
            const targetVoiceModel = VOICE_MAP[data.voice || "nova"] || "aura-asteria-en";

            // =================================================================
            // 🎙️ PROCESADOR DE AUDIO (DEEPGRAM -> GROQ)
            // =================================================================
            if (data.type === 'audio_input') {
                if (!data.payload) return;
                const audioBuffer = Buffer.from(data.payload, 'base64');

                try {
                    // PASO A: Transcripción + Detección de Idioma (Deepgram Nova-2)
                    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
                        audioBuffer,
                        { model: "nova-2", smart_format: true, detect_language: true, punctuate: true }
                    );

                    if (error) throw new Error("Fallo en STT");

                    let userText = result.results.channels[0].alternatives[0].transcript.trim();
                    let detectedCode = result.results.channels[0].alternatives[0].detected_language; // 'es', 'en', 'ja', etc.

                    // Filtros de entrada
                    if (userText.length < 2) return;
                    if (BLACKLIST.some(t => userText.includes(t))) return;

                    console.log(`🗣️ Entrada: "${userText}" [Detectado: ${detectedCode}]`);

                    // PASO B: Lógica de Dirección (El Juez)
                    // Si el audio es Español, traducimos a Inglés. Si no, al revés.
                    // Esto evita que la IA tenga que "adivinar".
                    let directionPrompt = "";
                    if (detectedCode === 'es' || detectedCode.startsWith('es')) {
                        directionPrompt = `TRANSLATE FROM SPANISH TO ${langB.toUpperCase()}.`;
                    } else if (detectedCode === 'en' || detectedCode.startsWith('en')) {
                        directionPrompt = `TRANSLATE FROM ENGLISH TO ${langA.toUpperCase()}.`;
                    } else {
                        // Si es un tercer idioma (ej. Japonés), traducimos al "otro" idioma configurado
                        directionPrompt = `DETECT LANGUAGE AND TRANSLATE TO THE OPPOSITE of (${langA} or ${langB}).`;
                    }

                    // PASO C: Traducción Estricta (Groq)
                    // TRUCO: Metemos el texto del usuario DENTRO del system prompt para que no parezca chat.
                    const systemPrompt = `
                    ROLE: TEXT PROCESSING API.
                    TASK: ${directionPrompt}
                    INPUT DATA: "${userText}"
                    
                    RULES:
                    1. RETURN ONLY THE TRANSLATED STRING.
                    2. NO CONVERSATION. (Input: "Hola" -> Output: "Hello". NOT "Hola, ¿qué tal?").
                    3. NO REPETITION. Output must be different from Input.
                    4. IGNORE QUESTIONS. Just translate them.
                    `;

                    const completion = await groq.chat.completions.create({
                        messages: [
                            { role: "system", content: systemPrompt }
                            // NOTA: No enviamos role: "user" para evitar que se active el modo chat.
                        ],
                        model: "llama-3.1-8b-instant",
                        temperature: 0.0, // Cero creatividad
                        max_tokens: 256
                    });

                    let aiText = cleanResponse(completion.choices[0].message.content);

                    // PASO D: Verificación de Calidad
                    if (isEcho(userText, aiText)) {
                        console.log("⚠️ Ecos bloqueado (La IA repitió el texto).");
                        return; // Abortamos para no enviar basura
                    }
                    if (!aiText || aiText === "SILENCE") return;

                    console.log(`✅ Salida: "${aiText}"`);
                    ws.lastAiResponse = aiText;

                    // PASO E: Generación de Audio (Solo si no es modo Fast)
                    let audioB64 = null;
                    if (!isFastMode) {
                        try {
                            const response = await fetch(`https://api.deepgram.com/v1/speak?model=${targetVoiceModel}`, {
                                method: 'POST',
                                headers: { 'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`, 'Content-Type': 'application/json' },
                                body: JSON.stringify({ text: aiText })
                            });
                            if (response.ok) {
                                const arrayBuffer = await response.arrayBuffer();
                                audioB64 = Buffer.from(arrayBuffer).toString('base64');
                            }
                        } catch (err) { console.error("TTS Error:", err.message); }
                    }

                    // Enviar respuesta
                    ws.send(JSON.stringify({
                        type: 'full_response',
                        user_text: userText,
                        ai_text: aiText,
                        audio: audioB64
                    }));

                } catch (err) { console.error("❌ Error Audio:", err.message); }
            }

            // =================================================================
            // 📝 PROCESADOR DE TEXTO/CHAT (IGUAL DE ESTRICTO)
            // =================================================================
            else if (data.type === 'text_input') {
                try {
                    console.log(`📝 Texto In: "${data.text}"`);

                    // Usamos el mismo truco: Inyectar el texto en el System Prompt
                    const systemPrompt = `
                    ROLE: STRICT TRANSLATOR MACHINE.
                    TASK: Translate the INPUT below to the OTHER language between (${langA} and ${langB}).
                    INPUT: "${data.text}"
                    
                    CRITICAL RULES:
                    - OUTPUT ONLY THE TRANSLATION.
                    - DO NOT ANSWER. (Example: "How are you?" -> "Cómo estás?" | NOT "I am fine").
                    `;

                    // Streaming para efecto visual en la app
                    const stream = await groq.chat.completions.create({
                        messages: [{ role: "system", content: systemPrompt }],
                        model: "llama-3.1-8b-instant",
                        temperature: 0.0,
                        stream: true
                    });

                    let fullAiText = "";
                    for await (const chunk of stream) {
                        const content = chunk.choices[0]?.delta?.content || "";
                        if (content) {
                            fullAiText += content;
                            ws.send(JSON.stringify({ type: 'stream_chunk', token: content }));
                        }
                    }
                    
                    ws.lastAiResponse = fullAiText;
                    console.log(`📝 Traducción: "${fullAiText}"`);

                    // Audio para el texto (Opcional, respeta modo Fast)
                    let audioB64 = null;
                    if (fullAiText && !isFastMode) {
                        const response = await fetch(`https://api.deepgram.com/v1/speak?model=${targetVoiceModel}`, {
                            method: 'POST',
                            headers: { 'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ text: fullAiText })
                        });
                        if (response.ok) {
                            const ab = await response.arrayBuffer();
                            audioB64 = Buffer.from(ab).toString('base64');
                        }
                    }

                    // Cierre del ciclo de texto
                    ws.send(JSON.stringify({
                        type: 'full_response',
                        user_text: data.text,
                        ai_text: fullAiText,
                        audio: audioB64
                    }));

                } catch (err) { console.error("❌ Error Texto:", err.message); }
            }

        } catch (e) { console.error("WS Error:", e.message); }
    });
});