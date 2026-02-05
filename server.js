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

console.log(`🏆 SERVIDOR LIVE FINAL (FLASH + HQ): Puerto ${PORT}`);

// 🎭 MAPEO DE VOCES (Frontend -> Deepgram Aura)
const VOICE_MAP = {
    "alloy": "aura-orion-en",   // Masculino (Rápido)
    "echo": "aura-arcas-en",    // Masculino (Profundo)
    "fable": "aura-athena-en",  // Femenino (Británico)
    "onyx": "aura-perseus-en",  // Masculino (Grave)
    "nova": "aura-asteria-en",  // Femenino (Energético - Default)
    "shimmer": "aura-luna-en"   // Femenino (Suave)
};

// 🚫 LISTA NEGRA DE ALUCINACIONES (Anti-Basura)
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
    const pattern = /(.{4,})\1{1,}/; 
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
            if (now - ws.lastMessageTime < 50) return; // Anti-flood leve
            ws.lastMessageTime = now;

            let data;
            try { data = JSON.parse(message); } catch (e) { return; }

            if (data.type === 'start_realtime_session' || data.type === 'ping') return;
            
            // -----------------------------------------------------------
            // 🔐 AUTH
            // -----------------------------------------------------------
            if (data.type === 'auth') {
                if (data.token !== APP_INTERNAL_KEY) {
                    ws.close();
                    return;
                }
                // Aquí podrías leer los créditos de Firebase si quieres validación extra
                // Pero lo importante es confirmar conexión exitosa
                ws.send(JSON.stringify({ type: 'auth_success' })); 
                return;
            }

            // --- LEER CONFIGURACIÓN DEL FRONTEND ---
            const langA = data.langSource || "Spanish"; 
            const langB = data.langTarget || "English";
            
            // 🔥 AQUÍ ESTÁ EL CAMBIO IMPORTANTE: Detectamos el Modo FLASH
            const isFastMode = data.fastMode === true; 
            
            const requestedVoice = data.voice || "alloy";
            const targetVoice = VOICE_MAP[requestedVoice] || "aura-asteria-en"; 

            // 🧠 PROMPT MAESTRO (Estricto - Interpretación Pura)
            const SYSTEM_PROMPT = `
            ROLE: You are a PROFESSIONAL INTERPRETER. You are NOT a chatbot.

            LANGUAGES:
            - Language A: ${langA}
            - Language B: ${langB}

            STRICT RULES:
            1. LISTEN to the user input.
            2. DETECT the language automatically (Is it ${langA} or ${langB}?).
            3. TRANSLATE immediately to the OPPOSITE language.
            4. OUTPUT ONLY THE TRANSLATED TEXT. NO EXPLANATIONS.
            5. IF user asks a question, DO NOT ANSWER IT. TRANSLATE IT.
            6. IF input is unintelligible, output "SILENCE".
            `;

            // =================================================================
            // 🎙️ MODO AUDIO (CORE)
            // =================================================================
            if (data.type === 'audio_input') {
                if (!data.payload) return;
                const audioBuffer = Buffer.from(data.payload, 'base64');
                
                try {
                    // 1. STT: Transcripción (Oído Universal)
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

                    // 🛡️ FILTROS DE LIMPIEZA
                    if (userText.length < 2) return; 
                    if (userText.length > 400) return; 
                    if (HALLUCINATION_TRIGGERS.some(t => userText.toLowerCase().includes(t.toLowerCase()))) return;
                    if (isRepetitive(userText)) return;
                    if (ws.lastAiResponse && stringSimilarity.compareTwoStrings(userText.toLowerCase(), ws.lastAiResponse.toLowerCase()) > 0.85) return;

                    console.log(`🗣️ [Input (${isFastMode ? 'FLASH' : 'HQ'})]: "${userText}"`);

                    // 2. LLM: Traducción (Cerebro)
                    const completion = await groq.chat.completions.create({
                        messages: [
                            { role: "system", content: SYSTEM_PROMPT }, 
                            { role: "user", content: userText }
                        ],
                        model: "llama-3.1-8b-instant",
                        temperature: 0.1, // Baja temperatura = Máxima precisión
                        max_tokens: 256
                    });
                    
                    let aiText = completion.choices[0].message.content.trim();
                    
                    if (!aiText || aiText === "SILENCE" || aiText.length < 1) return;
                    // Limpieza final de prefijos molestos
                    aiText = aiText.replace(/^(Translation:|Note:|Here is):?/gi, "").trim();

                    console.log(`🧠 [Output]: "${aiText}"`);
                    ws.lastAiResponse = aiText;

                    // 3. TTS: Generación de Voz (CONDICIONAL)
                    let audioB64 = null;

                    if (isFastMode) {
                        // ⚡ MODO FLASH: NO generamos audio. Enviamos null.
                        // El frontend usará Speech.speak() local.
                        audioB64 = null;
                        console.log("🚀 Enviando solo texto (Modo Flash)");
                    } else {
                        // 🎙️ MODO HQ: Generamos audio Deepgram.
                        // El frontend reproducirá este audio.
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
                        audioB64 = Buffer.from(arrayBuffer).toString('base64');
                        console.log("🎵 Enviando audio HQ");
                    }
                    
                    // 4. RESPUESTA
                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: userText, 
                        ai_text: aiText, 
                        audio: audioB64 
                    }));

                } catch (error) { console.error("❌ Error Audio:", error.message); }
            }
            
            // =================================================================
            // 📝 MODO TEXTO (Por si acaso se usa en el futuro)
            // =================================================================
            else if (data.type === 'text_input') {
                try {
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
                    
                    // Si entra texto, asumimos HQ por defecto, o podrías leer fastMode también
                    let audioB64 = null;
                    if (aiText.trim() && !isFastMode) {
                         const response = await fetch(`https://api.deepgram.com/v1/speak?model=${targetVoice}`, {
                            method: 'POST',
                            headers: { 'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`, 'Content-Type': 'application/json' },
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