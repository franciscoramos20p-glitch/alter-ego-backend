const { WebSocketServer } = require('ws');
const dotenv = require('dotenv');
const OpenAI = require('openai');
const { toFile } = require('openai');
const stringSimilarity = require('string-similarity');
const admin = require('firebase-admin');

// Cargar entorno
dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🔑 TU LLAVE DE SEGURIDAD
const APP_INTERNAL_KEY = "AlterEgo_Secure_2026_X9";

// ==========================================
// 🔥 CONEXIÓN A FIREBASE (OBLIGATORIA PARA COBRAR)
// ==========================================
try {
    // Asegúrate de tener el archivo firebase_key.json en la misma carpeta
    const serviceAccount = require('./firebase_key.json');
    
    // Evita error si ya está inicializado
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://alteregodb-1b8f3-default-rtdb.firebaseio.com"
        });
    }
    console.log("🔥 Firebase: CONECTADO (Modo Cobro Seguro)");
} catch (error) {
    console.error("❌ ERROR CRÍTICO: No se encuentra 'firebase_key.json'. El cobro fallará.", error.message);
}

const db = admin.database();

console.log(`🚀 SERVIDOR V80 MAESTRO: Puerto ${PORT} | Precio: 0.02 cred/seg`);

// 🚫 LISTA NEGRA (Anti-Basura)
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
// 💰 GESTIÓN DE CRÉDITOS (LADO SERVIDOR)
// ==========================================

async function checkCredits(userId, minRequired) {
    try {
        const ref = db.ref(`users/${userId}`);
        const snapshot = await ref.once('value');
        const userData = snapshot.val();
        
        if (!userData || userData.credits === undefined) return { ok: false, val: 0 };
        
        const current = parseFloat(userData.credits);
        return { ok: current >= minRequired, val: current };
    } catch (e) {
        console.error("Error Check:", e.message);
        return { ok: false, val: 0 };
    }
}

async function deductCredits(userId, amount) {
    try {
        const ref = db.ref(`users/${userId}/credits`);
        await ref.transaction((current) => {
            return Math.max(0, (current || 0) - amount);
        });
        console.log(`💰 Cobrado: ${amount.toFixed(4)} créditos a ${userId}`);
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
// 🔌 LÓGICA PRINCIPAL
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
            // Anti-DDoS (Rate Limit)
            const now = Date.now();
            if (now - ws.lastMessageTime < 200) return; 
            ws.lastMessageTime = now;

            let data;
            try { data = JSON.parse(message); } catch (e) { return; }

            if (data.type === 'ping') return;

            // 1. AUTENTICACIÓN
            if (data.type === 'auth') {
                if (data.token !== APP_INTERNAL_KEY) {
                    console.log("⛔ Token inválido. Bye.");
                    ws.close();
                    return;
                }
                ws.userId = data.user_id || "UNKNOWN";
                const status = await checkCredits(ws.userId, 0);
                ws.send(JSON.stringify({ type: 'auth_success', credits: status.val }));
                return;
            }

            const targetVoice = data.voice || "alloy"; 

            // =================================================================
            // 🎙️ AUDIO INPUT (LIVE) - COBRO POR SEGUNDO
            // =================================================================
            if (data.type === 'audio_input') {
                // Chequeo mínimo para empezar (0.5 créditos)
                const check = await checkCredits(ws.userId, 0.5);
                if (!check.ok) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Saldo insuficiente' }));
                    return;
                }

                if (!data.payload) return;
                const startTime = Date.now(); // ⏱️ Iniciamos cronómetro para cobrar exacto
                
                const audioBuffer = Buffer.from(data.payload, 'base64');
                const instruction = data.tone || "Translate content.";
                const langA = data.langSource || "Spanish";
                const langB = data.langTarget || "English";

                try {
                    // A. WHISPER (Detecta idioma)
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: await toFile(audioBuffer, 'speech.m4a'), 
                        model: "whisper-1",
                        prompt: "Conversation. Dialogue. Hola. Hello.", 
                        temperature: 0.2 
                    });
                    
                    let userText = transcription.text.trim();
                    
                    // FILTROS
                    if (userText.length < 2) return; 
                    if (HALLUCINATION_TRIGGERS.some(t => userText.toLowerCase().includes(t.toLowerCase()))) {
                        console.log(`🔇 Basura: "${userText}"`); return; 
                    }
                    // Anti-eco (no repetirse)
                    if (ws.lastAiResponse && stringSimilarity.compareTwoStrings(userText.toLowerCase(), ws.lastAiResponse.toLowerCase()) > 0.85) return;

                    console.log(`🗣️ User: "${userText}"`);

                    // B. GPT-4o (Traducir)
                    const stream = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `You are a STRICT INTERPRETER.
                                LANGUAGES: ${langA} <-> ${langB}.
                                RULES:
                                1. Detect language.
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

                    // C. TTS (Audio de respuesta)
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

                    // 🔥 CALCULO EXACTO DEL PRECIO
                    // 1.2 créditos por minuto = 0.02 créditos por segundo
                    const durationSeconds = (Date.now() - startTime) / 1000;
                    // Cobramos mínimo 2 segundos para cubrir costos base de API
                    const cost = Math.max(0.04, durationSeconds * 0.02);
                    
                    await deductCredits(ws.userId, cost);

                } catch (error) { console.error("❌ Audio Error:", error.message); }
            }
            
            // =================================================================
            // 📝 TEXT INPUT (COBRA 0.1 FIJO - GPT-4o MINI)
            // =================================================================
            else if (data.type === 'text_input') {
                const check = await checkCredits(ws.userId, 0.1);
                if (!check.ok) return;

                const instruction = data.tone || "Translate.";
                try {
                    const stream = await openai.chat.completions.create({
                        messages: [
                            { role: "system", content: "You are a TRANSLATION ENGINE. NO CHAT." },
                            { role: "system", content: instruction }, 
                            { role: "user", content: data.text }
                        ],
                        model: "gpt-4o-mini", // Barato y rápido
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

                    await deductCredits(ws.userId, 0.1);

                } catch(e) { console.error("❌ Texto Error:", e.message); }
            }
            
            // =================================================================
            // 📸 CÁMARA (COBRA 2.0 FIJO)
            // =================================================================
             else if (data.type === 'image_input') {
                 const check = await checkCredits(ws.userId, 2.0);
                 if (!check.ok) {
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
                                     { type: "text", text: `Identify text or objects. Translate findings to ${langTarget}. Concise.` }, 
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

                     await deductCredits(ws.userId, 2.0);

                 } catch (e) { console.error("❌ Visión Error:", e.message); }
             }

        } catch (e) { console.error("🔥 WS Error:", e.message); }
    });
});