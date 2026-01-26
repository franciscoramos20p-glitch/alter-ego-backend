import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI, { toFile } from 'openai';
import stringSimilarity from 'string-similarity';

// Cargar variables de entorno
dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🔑 CONFIGURACIÓN
const APP_INTERNAL_KEY = "AlterEgo_Secure_2026_X9";
const FIREBASE_DB_URL = 'https://alteregodb-1b8f3-default-rtdb.firebaseio.com'; 

console.log(`🏆 SERVIDOR PRO V104 (MINI + TURBO): Puerto: ${PORT}`);

// 🚫 LISTA NEGRA SUPREMA DE ALUCINACIONES (Anti-Hallucinations)
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
    "Me llamo Javier", "¿Cómo te llamas?", 
    "I'm going to go", "I'm going to do", 
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
            if (now - ws.lastMessageTime < 100) return; 
            ws.lastMessageTime = now;

            let data;
            try { data = JSON.parse(message); } catch (e) { return; }

            if (data.type === 'start_realtime_session' || data.type === 'ping') return;
            
            // -----------------------------------------------------------
            // 🔐 AUTH
            // -----------------------------------------------------------
            if (data.type === 'auth') {
                if (data.token !== APP_INTERNAL_KEY) {
                    console.log("⛔ Intruso bloqueado.");
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
                    } catch (err) {
                        console.error("Error leyendo Firebase:", err.message);
                    }
                }
                
                console.log(`✅ Auth OK. Usuario: ${data.user_id || 'Anon'}. Créditos Server: ${realCredits}`);
                ws.send(JSON.stringify({ type: 'auth_success', credits: realCredits })); 
                return;
            }

            const targetVoice = data.voice || "alloy"; 
            const langNameA = data.langSource || "Spanish"; 
            const langNameB = data.langTarget || "English"; 

            // =================================================================
            // 🎙️ MODO AUDIO (OPTIMIZADO GPT-4o-MINI)
            // =================================================================
            if (data.type === 'audio_input') {
                if (!data.payload) return;
                const audioBuffer = Buffer.from(data.payload, 'base64');
                
                try {
                    // 1. WHISPER (Reconocimiento)
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: await toFile(audioBuffer, 'speech.m4a'), 
                        model: "whisper-1",
                        response_format: "verbose_json",
                        prompt: `Conversation in ${langNameA} or ${langNameB}. Do not repeat text.`, 
                        temperature: 0.2
                    });
                    
                    let userText = transcription.text.trim();

                    // 🛡️ FILTROS
                    if (userText.length > 200) { console.log("🔇 Texto largo (filtro)."); return; }
                    if (userText.length < 2) return; 
                    if (HALLUCINATION_TRIGGERS.some(t => userText.toLowerCase().includes(t.toLowerCase()))) {
                        console.log(`🔇 Basura bloqueada: "${userText}"`); return; 
                    }
                    if (isRepetitive(userText)) {
                        console.log(`🔁 Bucle detectado: "${userText}"`); return;
                    }
                    if (ws.lastAiResponse && stringSimilarity.compareTwoStrings(userText.toLowerCase(), ws.lastAiResponse.toLowerCase()) > 0.85) return;

                    console.log(`🗣️ [Audio] Input: "${userText}"`);

                    // 2. GPT-4o-MINI (🔥 CAMBIO AQUÍ: VELOCIDAD PURA)
                    const requestedTone = data.tone || ""; 

                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `YOU ARE A TRANSLATOR ENGINE.
                                LANG A: ${langNameA}. LANG B: ${langNameB}.
                                
                                ${requestedTone} 
                                
                                RULES:
                                1. If input is ${langNameA} -> Translate to ${langNameB}.
                                2. If input is ${langNameB} -> Translate to ${langNameA}.
                                3. OUTPUT ONLY THE TRANSLATED TEXT. NO EXPLANATIONS.
                                4. If input creates an infinite loop or makes no sense, return "SILENCE".` 
                            }, 
                            { role: "user", content: userText }
                        ],
                        // 🔥🔥🔥 CAMBIO DE MODELO AQUÍ 👇
                        model: "gpt-4o-mini", 
                        max_tokens: 300,
                        temperature: 0.7 
                    });
                    
                    const aiText = completion.choices[0].message.content;
                    if (!aiText || aiText === "SILENCE" || aiText.length < 2) return;
                    if (stringSimilarity.compareTwoStrings(aiText.toLowerCase(), userText.toLowerCase()) > 0.95) return;

                    console.log(`🧠 Salida (Mini): "${aiText}"`);
                    ws.lastAiResponse = aiText;

                    // 3. TTS (Voz)
                    const mp3Response = await openai.audio.speech.create({ 
                        model: "tts-1", voice: targetVoice, input: aiText, response_format: "aac"
                    });
                    const bufferTTS = Buffer.from(await mp3Response.arrayBuffer());
                    const audioB64 = bufferTTS.toString('base64');
                    
                    // Enviamos stream para quien lo quiera
                    ws.send(JSON.stringify({ type: 'audio_stream', audio: audioB64 }));
                    
                    // 🔥 RESPUESTA COMPLETA (Corregido: usamos 'audio' no 'audio_payload')
                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: userText, 
                        ai_text: aiText, 
                        audio: audioB64 // 🔥 CLAVE: El cliente busca msg.audio
                    }));

                } catch (error) { console.error("❌ Audio Error:", error.message); }
            }
            
            // =================================================================
            // 📝 MODO TEXTO (Ya usaba Mini, solo corregimos la salida)
            // =================================================================
            else if (data.type === 'text_input') {
                const requestedTone = data.tone || "Neutral";
                try {
                    const stream = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `TRANSLATOR: ${langNameA} <-> ${langNameB}.
                                INSTRUCTIONS: ${requestedTone}` 
                            }, 
                            { role: "user", content: data.text }
                        ],
                        model: "gpt-4o-mini",
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
                    
                    let audioB64 = null;
                    if (aiText.trim()) {
                        const mp3 = await openai.audio.speech.create({ 
                            model: "tts-1", voice: targetVoice, input: aiText, response_format: 'aac' 
                        });
                        const buffer = Buffer.from(await mp3.arrayBuffer());
                        audioB64 = buffer.toString('base64');
                    }

                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: data.text, 
                        ai_text: aiText, 
                        audio: audioB64 // 🔥 Corregido para consistencia
                    }));
                } catch(e) { console.error("Classic Error:", e.message); }
            }

        } catch (e) { console.error("WS Error:", e.message); }
    });
});