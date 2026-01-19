const { WebSocketServer } = require('ws');
const dotenv = require('dotenv');
const OpenAI = require('openai');
const { toFile } = require('openai');
const stringSimilarity = require('string-similarity');
const admin = require('firebase-admin');

// Cargar variables de entorno
dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🔑 LLAVE MAESTRA DE TU APP
const APP_INTERNAL_KEY = "AlterEgo_Secure_2026_X9";

// ==========================================
// 🔥 1. CONEXIÓN A FIREBASE (VITAL)
// ==========================================
try {
    const serviceAccount = require('./firebase_key.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://alteregodb-1b8f3-default-rtdb.firebaseio.com"
    });
    console.log("🔥 Firebase Conectado OK");
} catch (error) {
    console.error("❌ ERROR FIREBASE: Falta 'firebase_key.json'", error.message);
}

const db = admin.database();

console.log(`🚀 SERVIDOR V79 [PRECIOS AJUSTADOS]: Puerto ${PORT}`);

// 🛡️ LISTA NEGRA (Anti-Alucinaciones)
const HALLUCINATION_TRIGGERS = [
    "Subtitles by", "Amara.org", "Community", "Translated by", 
    "watching", "Please subscribe", "sous-titres", "captioned",
    "Solo ves lo que puedes ver", "Gracias por ver", "Thanks for watching", 
    "No olvides suscribirte", "Copyright", "All rights reserved", "suscríbete",
    "DimaTorzok", "ZHUKOV", "Proyecto Touhou", "obra derivada",
    "Transcribe exactly", "lo que se dice", "Transcribir exactamente", 
    "Direct conversation", "MBC", "SBS"
];

// ==========================================
// 💰 GESTIÓN DE CRÉDITOS
// ==========================================

async function checkCredits(userId, cost) {
    try {
        const ref = db.ref(`users/${userId}`);
        const snapshot = await ref.once('value');
        const userData = snapshot.val();
        
        if (!userData || userData.credits === undefined) {
            return { allowed: false, current: 0 };
        }
        const current = parseFloat(userData.credits);
        return { allowed: current >= cost, current: current };
    } catch (e) {
        console.error("Error Check:", e.message);
        return { allowed: false, current: 0 };
    }
}

async function deductCredits(userId, amount) {
    try {
        const ref = db.ref(`users/${userId}/credits`);
        await ref.transaction((current) => {
            return (current || 0) - amount;
        });
        console.log(`💰 Cobrado ${amount.toFixed(4)} a ${userId}`);
    } catch (e) {
        console.error("Error Deduct:", e.message);
    }
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
// 🔌 WEBSOCKET PRINCIPAL
// ==========================================
wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.userId = "UNKNOWN"; 
    ws.lastMessageTime = 0;
    ws.lastAiResponse = "";

    console.log(`⚡ Cliente Nuevo: ${req.socket.remoteAddress}`);

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (message) => {
        try {
            // 🛡️ ANTI-DDOS
            const now = Date.now();
            if (now - ws.lastMessageTime < 150) return; 
            ws.lastMessageTime = now;

            let data;
            try { data = JSON.parse(message); } catch (e) { return; }

            if (data.type === 'ping') return;

            // 🛡️ AUTENTICACIÓN
            if (data.type === 'auth') {
                if (data.token !== APP_INTERNAL_KEY) {
                    console.log("⛔ Token inválido. Cerrando.");
                    ws.close();
                    return;
                }
                ws.userId = data.user_id || "UNKNOWN";
                // Enviar saldo inicial
                const status = await checkCredits(ws.userId, 0);
                ws.send(JSON.stringify({ type: 'auth_success', credits: status.current }));
                return;
            }

            const targetVoice = data.voice || "alloy"; 

            // =================================================================
            // 🎙️ AUDIO INPUT (LIVE - 0.02 Créditos/seg)
            // =================================================================
            if (data.type === 'audio_input') {
                // Chequeo mínimo
                const check = await checkCredits(ws.userId, 0.1);
                if (!check.allowed) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Sin saldo' }));
                    return;
                }

                if (!data.payload) return;
                const startTime = Date.now();
                
                const rawLangA = data.langSource || "Español";
                const rawLangB = data.langTarget || "Inglés";
                const audioBuffer = Buffer.from(data.payload, 'base64');
                
                try {
                    // A. WHISPER (Detecta idioma auto)
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: await toFile(audioBuffer, 'speech.m4a'), 
                        model: "whisper-1",
                        prompt: "Conversation. Dialogue. Hola. Hello.", 
                        temperature: 0.2 
                    });
                    
                    let userText = transcription.text.trim();
                    
                    // FILTROS ANTI-BASURA
                    if (userText.length < 2) return; 
                    if (HALLUCINATION_TRIGGERS.some(t => userText.toLowerCase().includes(t.toLowerCase()))) {
                        console.log(`🔇 Basura detectada: "${userText}"`); return; 
                    }
                    if (ws.lastAiResponse && stringSimilarity.compareTwoStrings(userText.toLowerCase(), ws.lastAiResponse.toLowerCase()) > 0.85) return;

                    console.log(`🗣️ Audio: "${userText}"`);

                    // B. GPT-4o (Traducir)
                    const stream = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `You are a STRICT INTERPRETER.
                                CONTEXT: ${rawLangA} <-> ${rawLangB}
                                RULES:
                                1. Auto-detect input language.
                                2. Translate to the OTHER language.
                                3. OUTPUT ONLY TRANSLATION. NO CHAT.
                                4. If noise/silence, output NOTHING.` 
                            }, 
                            { role: "user", content: userText }
                        ],
                        model: "gpt-4o",
                        max_tokens: 300,
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
                    
                    if (!aiText || aiText.trim().length === 0) return;
                    ws.lastAiResponse = aiText;

                    // C. TTS
                    const mp3Response = await openai.audio.speech.create({ 
                        model: "tts-1", voice: targetVoice, input: aiText, response_format: "aac"
                    });
                    const bufferTTS = Buffer.from(await mp3Response.arrayBuffer());
                    
                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: userText, 
                        ai_text: aiText, 
                        audio_payload: bufferTTS.toString('base64') 
                    }));

                    // 🔥 COBRO DINÁMICO (Por duración real aprox)
                    // Asumimos que el audio duró aprox lo que tardó el proceso / factor
                    const processTime = (Date.now() - startTime) / 1000; 
                    // Fórmula simple: 0.02 créditos por segundo de procesamiento "efectivo"
                    const cost = Math.max(0.05, processTime * 0.05); 
                    await deductCredits(ws.userId, cost);

                } catch (error) { console.error("❌ Audio Error:", error.message); }
            }
            
            // =================================================================
            // 📝 TEXT INPUT (0.1 Créditos - GPT-4o Mini)
            // =================================================================
            else if (data.type === 'text_input') {
                const check = await checkCredits(ws.userId, 0.1);
                if (!check.allowed) return;

                const systemPrompt = data.tone || `Translate input.`; 
                try {
                    console.log(`📝 Texto: "${data.text}"`);
                    
                    const stream = await openai.chat.completions.create({
                        messages: [
                            { role: "system", content: "You are a TRANSLATION ENGINE. NO CHAT." },
                            { role: "system", content: systemPrompt }, 
                            { role: "user", content: data.text }
                        ],
                        model: "gpt-4o-mini", // 🔥 MODELO MINI
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
                        audio_payload: audioB64 
                    }));

                    // 🔥 COBRO FIJO TEXTO
                    await deductCredits(ws.userId, 0.1);

                } catch(e) { console.error("❌ Texto Error:", e.message); }
            }
            
            // =================================================================
            // 📸 VISIÓN (2.0 Créditos - GPT-4o)
            // =================================================================
             else if (data.type === 'image_input') {
                 const check = await checkCredits(ws.userId, 2.0);
                 if (!check.allowed) {
                     ws.send(JSON.stringify({ type: 'error', message: 'Saldo insuficiente' }));
                     return;
                 }

                 console.log("📸 Imagen recibida");
                 const langTarget = data.language || "English";
                 
                 try {
                     const response = await openai.chat.completions.create({
                         model: "gpt-4o", 
                         messages: [
                             { 
                                 role: "user", 
                                 content: [
                                     { type: "text", text: `Identify text or objects. Translate findings to ${langTarget}. Concise output.` }, 
                                     { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.payload}` } }
                                 ] 
                             }
                         ],
                         max_tokens: 200,
                     });
                     
                     const aiText = response.choices[0].message.content;
                     const mp3 = await openai.audio.speech.create({ 
                         model: "tts-1", voice: targetVoice, input: aiText, response_format: 'aac' 
                     });
                     const buffer = Buffer.from(await mp3.arrayBuffer());
                     
                     ws.send(JSON.stringify({ 
                         type: 'full_response', 
                         user_text: "📷 Imagen", 
                         ai_text: aiText, 
                         audio_payload: buffer.toString('base64') 
                     }));

                     // 🔥 COBRO FOTO
                     await deductCredits(ws.userId, 2.0);

                 } catch (e) { console.error("❌ Visión Error:", e.message); }
             }

        } catch (e) { console.error("🔥 WS Error:", e.message); }
    });
});