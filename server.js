import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import { createClient } from '@deepgram/sdk';
import stringSimilarity from 'string-similarity';

// Cargar variables de entorno
dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

// 🆕 INICIALIZACIÓN DE MOTORES
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

// 🔑 CONFIGURACIÓN DE SEGURIDAD
const APP_INTERNAL_KEY = "AlterEgo_Secure_2026_X9";
const FIREBASE_DB_URL = 'https://alteregodb-1b8f3-default-rtdb.firebaseio.com'; 

console.log(`🏆 SERVIDOR INTERPRETE PRO V2.0: Puerto: ${PORT}`);

// 🎭 MAPEO DE VOCES (Frontend -> Deepgram Aura)
const VOICE_MAP = {
    "alloy": "aura-orion-en",   // Masculino (Rápido)
    "echo": "aura-arcas-en",    // Masculino (Profundo)
    "fable": "aura-athena-en",  // Femenino (Británico)
    "onyx": "aura-perseus-en",  // Masculino (Grave)
    "nova": "aura-asteria-en",  // Femenino (Energético - Default)
    "shimmer": "aura-luna-en"   // Femenino (Suave)
};

// 🚫 LISTA NEGRA DE ALUCINACIONES (Mantenida y Reforzada)
const HALLUCINATION_TRIGGERS = [
    "Subtitles by", "Amara.org", "Community", "Translated by", "watching", 
    "Please subscribe", "sous-titres", "captioned", "Closed captioning",
    "Subtítulos realizados por", "Subtítulos por", "Traducción por",
    "Solo ves lo que puedes ver", "You only see what you can see",
    "Gracias por ver", "Thanks for watching", "No olvides suscribirte", 
    "Copyright", "All rights reserved", "suscríbete", "like and subscribe",
    "videoplayback", "video playback",
    "DimaTorzok", "ZHUKOV", "Proyecto Touhou", "obra derivada", 
    "Transcribe exactly", "lo que se dice", "Transcribir exactamente",
    "Direct conversation", "MBC", "SBS", "Al Jazeera", "engvid.com",
    "TED", "TEDx", "Ted talks",
    "Me llamo Javier", 
    "999", "1234", "00:00",
    ". . .", ", . .", ", ...", "...", "..",
    "[Music]", "[Música]", "(Music)", "(Música)", 
    "[Applause]", "[Aplausos]", "(Applause)", "(Aplausos)",
    "[Laughter]", "[Risas]", "[Silence]", "[Silencio]",
    "www.", ".com", ".net", ".org", "http", "https"
];

function isRepetitive(text) {
    if (!text) return false;
    const pattern = /(.{4,})\1{1,}/; // Detecta bucles de texto
    return pattern.test(text);
}

// 💓 HEARTBEAT
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => clearInterval(interval));

// ==========================================
// 🔌 CONEXIÓN WEBSOCKET
// ==========================================
wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.lastMessageTime = 0; 
    ws.lastAiResponse = ""; 

    console.log(`⚡ Cliente Conectado: ${req.socket.remoteAddress}`);

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (message) => {
        try {
            const now = Date.now();
            if (now - ws.lastMessageTime < 100) return; // Anti-Flood
            ws.lastMessageTime = now;

            let data;
            try { data = JSON.parse(message); } catch (e) { return; }

            if (data.type === 'start_realtime_session' || data.type === 'ping') return;
            
            // -----------------------------------------------------------
            // 🔐 AUTH (Sin cambios, funciona bien)
            // -----------------------------------------------------------
            if (data.type === 'auth') {
                if (data.token !== APP_INTERNAL_KEY) {
                    ws.close();
                    return;
                }
                let realCredits = 0;
                if (data.user_id) {
                    try {
                        const response = await fetch(`${FIREBASE_DB_URL}/users/${data.user_id}.json`);
                        const userData = await response.json();
                        if (userData && userData.credits !== undefined) {
                            realCredits = parseFloat(userData.credits);
                        }
                    } catch (err) { console.error("Firebase Error:", err.message); }
                }
                ws.send(JSON.stringify({ type: 'auth_success', credits: realCredits })); 
                return;
            }

            // Configuración Dinámica
            const requestedVoice = data.voice || "alloy";
            const targetVoice = VOICE_MAP[requestedVoice] || "aura-asteria-en"; 
            const langA = data.langSource || "Spanish"; 
            const langB = data.langTarget || "English"; 

            // 🧠 PROMPT MAESTRO DE INTERPRETACIÓN
            // Este es el secreto. Define reglas estrictas para NO conversar.
            const SYSTEM_PROMPT = `
            ROLE: You are a PROFESSIONAL INTERPRETER. You are NOT a chatbot. You are a transparent translation layer.

            LANGUAGES:
            - Language A: ${langA}
            - Language B: ${langB}

            STRICT RULES:
            1. LISTEN to the user input.
            2. DETECT the language automatically (Is it ${langA} or ${langB}?).
            3. TRANSLATE immediately to the OPPOSITE language.
            4. OUTPUT ONLY THE TRANSLATED TEXT. NO EXPLANATIONS. NO "Here is the translation".
            5. PRESERVE the tone, intent, and nuance.
            6. IF user asks a question (e.g., "Where is the bathroom?"), DO NOT ANSWER IT. TRANSLATE IT.
            7. IF input is unintelligible or noise, output "SILENCE".
            `;

            // =================================================================
            // 🎙️ MODO AUDIO (FLUJO OPTIMIZADO)
            // =================================================================
            if (data.type === 'audio_input') {
                if (!data.payload) return;
                const audioBuffer = Buffer.from(data.payload, 'base64');
                
                try {
                    // 1. STT: Oído Universal (Detecta idioma auto)
                    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
                        audioBuffer,
                        {
                            model: "nova-2",
                            smart_format: true,
                            detect_language: true, 
                            punctuate: true
                        }
                    );

                    if (error) throw new Error("Deepgram STT Error");
                    let userText = result.results.channels[0].alternatives[0].transcript.trim();

                    // 🛡️ FILTROS DE SEGURIDAD
                    if (userText.length > 300) return; // Ignorar discursos largos accidentales
                    if (userText.length < 2) return; 
                    if (HALLUCINATION_TRIGGERS.some(t => userText.toLowerCase().includes(t.toLowerCase()))) return;
                    if (isRepetitive(userText)) return;
                    if (ws.lastAiResponse && stringSimilarity.compareTwoStrings(userText.toLowerCase(), ws.lastAiResponse.toLowerCase()) > 0.85) return;

                    console.log(`🗣️ [Input (${langA}/${langB})]: "${userText}"`);

                    // 2. LLM: Cerebro Traductor (Groq)
                    const completion = await groq.chat.completions.create({
                        messages: [
                            { role: "system", content: SYSTEM_PROMPT }, 
                            { role: "user", content: userText }
                        ],
                        model: "llama-3.1-8b-instant",
                        temperature: 0.1, // ❄️ Temperatura CERO o muy baja para evitar creatividad/conversación
                        max_tokens: 256
                    });
                    
                    let aiText = completion.choices[0].message.content.trim();
                    
                    // Limpieza final de respuesta
                    if (!aiText || aiText === "SILENCE" || aiText.length < 1) return;
                    if (aiText.includes("Note:") || aiText.includes("Translation:")) {
                         aiText = aiText.replace(/^(Translation:|Note:|Here is):?/gi, "").trim();
                    }

                    console.log(`🧠 [Output]: "${aiText}"`);
                    ws.lastAiResponse = aiText;

                    // 3. TTS: Generación de Voz
                    // Nota: Deepgram Aura es excelente en Inglés. En otros idiomas puede tener acento.
                    const response = await fetch(`https://api.deepgram.com/v1/speak?model=${targetVoice}`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ text: aiText })
                    });

                    if (!response.ok) throw new Error("Deepgram TTS Error");
                    const arrayBuffer = await response.arrayBuffer();
                    const audioB64 = Buffer.from(arrayBuffer).toString('base64');
                    
                    // Enviar al cliente
                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: userText, 
                        ai_text: aiText, 
                        audio: audioB64 
                    }));

                } catch (error) { console.error("❌ Error Audio:", error.message); }
            }
            
            // =================================================================
            // 📝 MODO TEXTO (IGUAL DE ESTRICTO)
            // =================================================================
            else if (data.type === 'text_input') {
                try {
                    // Usamos el mismo Prompt estricto
                    const stream = await groq.chat.completions.create({
                        messages: [
                            { role: "system", content: SYSTEM_PROMPT }, 
                            { role: "user", content: data.text }
                        ],
                        model: "llama-3.1-8b-instant",
                        temperature: 0.1,
                        stream: true
                    });

                    let aiText = "";
                    for await (const chunk of stream) {
                        const content = chunk.choices[0]?.delta?.content || "";
                        if (content) {
                            aiText += content;
                            ws.send(JSON.stringify({ type: 'stream_chunk', token: content }));
                        }
                    }
                    ws.lastAiResponse = aiText;
                    
                    // Generar Audio si hay texto
                    let audioB64 = null;
                    if (aiText.trim() && aiText !== "SILENCE") {
                        const response = await fetch(`https://api.deepgram.com/v1/speak?model=${targetVoice}`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ text: aiText })
                        });
                        const arrayBuffer = await response.arrayBuffer();
                        audioB64 = Buffer.from(arrayBuffer).toString('base64');
                    }

                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: data.text, 
                        ai_text: aiText, 
                        audio: audioB64 
                    }));
                } catch(e) { console.error("Error Texto:", e.message); }
            }

        } catch (e) { console.error("WS Error:", e.message); }
    });
});