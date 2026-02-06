import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import { createClient } from '@deepgram/sdk';
import stringSimilarity from 'string-similarity';

// =============================================================
// ⚙️ CONFIGURACIÓN INICIAL
// =============================================================
dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

// Inicialización de las APIs
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

const APP_INTERNAL_KEY = "AlterEgo_Secure_2026_X9";

console.log(`🚀 SERVIDOR MAESTRO V120 INICIADO EN PUERTO: ${PORT}`);
console.log(`🛡️ MODOS ACTIVOS: AUDIO (Deepgram+Groq) | TEXTO (Streaming) | FLASH/HQ`);

// =============================================================
// 🧠 BASES DE DATOS VOLÁTILES (VOCES Y FILTROS)
// =============================================================

// Mapeo exacto para las voces que envía tu Frontend
const VOICE_MAP = {
    "alloy": "aura-orion-en",   
    "echo": "aura-arcas-en",    
    "fable": "aura-athena-en",  
    "onyx": "aura-perseus-en",  
    "nova": "aura-asteria-en",  
    "shimmer": "aura-luna-en"   
};

// Lista negra de "basura" que a veces lee el micrófono
const HALLUCINATION_TRIGGERS = [
    "Subtitles by", "Amara.org", "Translated by", "watching", 
    "Please subscribe", "sous-titres", "captioned", 
    "999", "1234", "00:00", ". . .", "...",
    "video playback", "audiovisual content"
];

// Función para detectar si la IA está repitiendo lo mismo (Modo Loro)
function isEcho(text1, text2) {
    if (!text1 || !text2) return false;
    return stringSimilarity.compareTwoStrings(text1.toLowerCase(), text2.toLowerCase()) > 0.80;
}

// Mantener la conexión viva (Heartbeat)
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => clearInterval(interval));

// =============================================================
// 🔌 NÚCLEO DEL WEBSOCKET
// =============================================================
wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.lastMessageTime = 0; 
    ws.lastAiResponse = ""; 

    console.log(`⚡ Cliente conectado desde: ${req.socket.remoteAddress}`);

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (message) => {
        try {
            // Control de flujo (evitar saturación)
            const now = Date.now();
            if (now - ws.lastMessageTime < 50) return; 
            ws.lastMessageTime = now;

            let data;
            try { data = JSON.parse(message); } catch (e) { return; }

            // 1. AUTENTICACIÓN
            if (data.type === 'auth') {
                if (data.token !== APP_INTERNAL_KEY) {
                    console.log("⛔ Intento de acceso no autorizado.");
                    ws.close();
                } else {
                    ws.send(JSON.stringify({ type: 'auth_success' })); 
                }
                return;
            }

            // Extracción de variables comunes del Frontend
            const langA = data.langSource || "Spanish";
            const langB = data.langTarget || "English";
            const isFastMode = data.fastMode === true; // Detecta si el rayo está amarillo
            const voiceId = data.voice || "nova";
            const targetVoiceModel = VOICE_MAP[voiceId] || "aura-asteria-en";

            // =================================================================
            // 🎙️ MANEJADOR DE AUDIO (VOZ)
            // =================================================================
            if (data.type === 'audio_input') {
                if (!data.payload) return;
                
                const audioBuffer = Buffer.from(data.payload, 'base64');
                
                try {
                    // PASO A: OÍDO DIGITAL (Deepgram Nova-2)
                    // Detectamos qué se dijo Y en qué idioma
                    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
                        audioBuffer,
                        {
                            model: "nova-2",
                            smart_format: true,
                            detect_language: true, // ¡Clave! Detecta el idioma real
                            punctuate: true
                        }
                    );

                    if (error) throw new Error("Error en Transcripción Deepgram");
                    
                    let userText = result.results.channels[0].alternatives[0].transcript.trim();
                    let detectedCode = result.results.channels[0].alternatives[0].detected_language; // ej: 'es', 'en', 'ja'

                    // Filtros de limpieza inicial
                    if (userText.length < 2) return;
                    if (HALLUCINATION_TRIGGERS.some(t => userText.includes(t))) return;

                    console.log(`🗣️ Audio Recibido: "${userText}" [Detectado: ${detectedCode}]`);

                    // PASO B: CEREBRO TRADUCTOR (Groq Llama 3)
                    // Usamos temperatura 0 para eliminar creatividad (adiós modo chat)
                    
                    const systemPrompt = `
                    TASK: MACHINE TRANSLATION.
                    
                    CONTEXT:
                    - User Configured Language 1: ${langA}
                    - User Configured Language 2: ${langB}
                    - Audio Language Detected: ${detectedCode}
                    
                    LOGIC:
                    1. If audio is detected as ${langA} (or similar), TRANSLATE TO ${langB}.
                    2. If audio is detected as ${langB} (or similar), TRANSLATE TO ${langA}.
                    
                    STRICT RULES:
                    - OUTPUT ONLY THE FINAL TRANSLATED TEXT.
                    - DO NOT ANSWER QUESTIONS. (Example: Input "How are you?" -> Output "Cómo estás?", NOT "I am fine").
                    - DO NOT REPEAT INPUT. (Example: Input "Hola" -> Output MUST NOT be "Hola").
                    - IF INPUT IS GARBAGE/NOISE, OUTPUT "SILENCE".
                    `;

                    const completion = await groq.chat.completions.create({
                        messages: [
                            { role: "system", content: systemPrompt },
                            { role: "user", content: userText } // Aquí es seguro porque el System Prompt es muy estricto
                        ],
                        model: "llama-3.1-8b-instant",
                        temperature: 0.0, // MÁQUINA FRÍA
                        max_tokens: 256
                    });
                    
                    let aiText = completion.choices[0].message.content.trim();
                    
                    // Limpieza final de la respuesta
                    aiText = aiText.replace(/Translation:/gi, '').replace(/"/g, '').trim();

                    // BLOQUEO DE LORO: Si la traducción es igual a la entrada, abortamos
                    if (isEcho(userText, aiText)) {
                        console.log("⚠️ Ecos detectado (Traducción idéntica). Bloqueando.");
                        return;
                    }
                    if (!aiText || aiText === "SILENCE") return;

                    console.log(`✅ Traducción Generada: "${aiText}"`);
                    ws.lastAiResponse = aiText;

                    // PASO C: GENERACIÓN DE VOZ (TTS)
                    // Depende del modo FLASH vs HQ
                    let audioB64 = null;

                    if (isFastMode) {
                        // MODO FLASH (Rayo Amarillo): No generamos audio aquí.
                        // Enviamos null y tu App usará Speech.speak() localmente (Cero latencia).
                        audioB64 = null;
                        console.log("⚡ Modo Flash: Enviando solo texto.");
                    } else {
                        // MODO HQ (Rayo Apagado): Generamos audio premium con Deepgram
                        try {
                            const response = await fetch(`https://api.deepgram.com/v1/speak?model=${targetVoiceModel}`, {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({ text: aiText })
                            });

                            if (response.ok) {
                                const arrayBuffer = await response.arrayBuffer();
                                audioB64 = Buffer.from(arrayBuffer).toString('base64');
                            }
                        } catch (err) {
                            console.error("Error TTS:", err);
                        }
                    }

                    // PASO D: ENVIAR AL FRONTEND
                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: userText, 
                        ai_text: aiText, 
                        audio: audioB64 
                    }));

                } catch (error) { console.error("❌ Error Proceso Audio:", error.message); }
            }
            
            // =================================================================
            // 📝 MANEJADOR DE TEXTO (CHAT)
            // =================================================================
            else if (data.type === 'text_input') {
                try {
                    console.log(`📝 Texto Recibido: "${data.text}"`);
                    
                    // Usamos la misma lógica estricta para el chat
                    const systemPrompt = `
                    TASK: STRICT TRANSLATION.
                    FROM: ${langA} (Auto-detect if needed)
                    TO: The other language (${langB}).
                    RULES: OUTPUT ONLY TRANSLATION. NO CHAT. NO ANSWERS.
                    `;

                    const stream = await groq.chat.completions.create({
                        messages: [
                            { role: "system", content: systemPrompt },
                            { role: "user", content: data.text }
                        ],
                        model: "llama-3.1-8b-instant",
                        temperature: 0.0,
                        stream: true // Efecto de escritura en tiempo real
                    });

                    let aiText = "";
                    for await (const chunk of stream) {
                        const content = chunk.choices[0]?.delta?.content || "";
                        if (content) {
                            aiText += content;
                            // Enviamos letra por letra para que se vea bonito en el chat
                            ws.send(JSON.stringify({ type: 'stream_chunk', token: content }));
                        }
                    }
                    
                    ws.lastAiResponse = aiText;
                    console.log(`📝 Traducción Texto: "${aiText}"`);

                    // Generar Audio del texto (Si el usuario no está en modo Flash)
                    let audioB64 = null;
                    if (aiText && !isFastMode) {
                         const response = await fetch(`https://api.deepgram.com/v1/speak?model=${targetVoiceModel}`, {
                            method: 'POST',
                            headers: { 'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ text: aiText })
                        });
                        if (response.ok) {
                            const arrayBuffer = await response.arrayBuffer();
                            audioB64 = Buffer.from(arrayBuffer).toString('base64');
                        }
                    }

                    // Confirmación final
                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: data.text, 
                        ai_text: aiText, 
                        audio: audioB64 
                    }));

                } catch(e) { console.error("❌ Error Proceso Texto:", e.message); }
            }

        } catch (e) { console.error("WS Error General:", e.message); }
    });
});