import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI, { toFile } from 'openai';
import stringSimilarity from 'string-similarity';

dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🔑 LLAVE DE SEGURIDAD
const APP_INTERNAL_KEY = "AlterEgo_Secure_2026_X9";

console.log(`🛡️ SERVIDOR V97 [TRADUCTOR ESTRICTO]: Cero Charla | Detección Forzada. Puerto: ${PORT}`);

// 🚫 LISTA NEGRA
const HALLUCINATION_TRIGGERS = [
    "Subtitles by", "Amara.org", "Community", "Translated by", 
    "watching", "Please subscribe", "sous-titres", "captioned",
    "Solo ves lo que puedes ver", "Gracias por ver", "Thanks for watching", 
    "No olvides suscribirte", "Copyright", "All rights reserved", "suscríbete",
    "DimaTorzok", "ZHUKOV", "Proyecto Touhou", "obra derivada",
    "Transcribe exactly", "lo que se dice", "Transcribir exactamente", 
    "Direct conversation", "MBC", "SBS", "Al Jazeera"
];

const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => clearInterval(interval));

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
            
            if (data.type === 'auth') {
                if (data.token !== APP_INTERNAL_KEY) {
                    console.log("⛔ Intruso bloqueado.");
                    ws.close(); return;
                }
                ws.send(JSON.stringify({ type: 'auth_success', credits: 999 })); 
                return;
            }

            const targetVoice = data.voice || "alloy"; 
            // Nombres de los idiomas para ayudar a la IA (ej: "Español", "Inglés")
            const langNameA = data.langSource || "Spanish"; 
            const langNameB = data.langTarget || "English"; 

            // =================================================================
            // 🎙️ MODO LIVE (GPT-4o - ESTRICTO)
            // =================================================================
            if (data.type === 'audio_input') {
                if (!data.payload) return;
                const audioBuffer = Buffer.from(data.payload, 'base64');
                
                try {
                    // 1. WHISPER: Le decimos qué idiomas esperar para que no alucine
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: await toFile(audioBuffer, 'speech.m4a'), 
                        model: "whisper-1",
                        response_format: "verbose_json",
                        // 🔥 TRUCO: Le damos contexto de los dos idiomas posibles
                        prompt: `Conversation in ${langNameA} or ${langNameB}.`, 
                        temperature: 0 
                    });
                    
                    let userText = transcription.text.trim();
                    let detectedLangCode = transcription.language; // ej: "es", "en"

                    // 🛡️ Filtros
                    if (userText.length < 2) return; 
                    if (HALLUCINATION_TRIGGERS.some(t => userText.toLowerCase().includes(t.toLowerCase()))) {
                        console.log("🔇 Basura bloqueada."); return; 
                    }
                    if (ws.lastAiResponse && stringSimilarity.compareTwoStrings(userText.toLowerCase(), ws.lastAiResponse.toLowerCase()) > 0.85) return;

                    console.log(`🗣️ [Detectado: ${detectedLangCode}] User: "${userText}"`);

                    // 2. LÓGICA DE DIRECCIÓN (A -> B o B -> A)
                    // No dejamos que GPT decida solo, le decimos nosotros.
                    let directionPrompt = `If input is ${langNameA}, translate to ${langNameB}. If input is ${langNameB}, translate to ${langNameA}.`;

                    // 3. GPT-4o (CEREBRO TRADUCTOR - NO CHAT)
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `YOU ARE A TRANSLATION ENGINE. NOT A CHATBOT.
                                
                                INSTRUCTIONS:
                                1. Your ONLY job is to translate the user input.
                                2. DO NOT answer questions. (e.g., if user says "How are you?", translate it, do not answer "I'm fine").
                                3. DO NOT carry on a conversation.
                                4. NEVER output the same language as the input.
                                
                                LANGUAGES: ${langNameA} <-> ${langNameB}.
                                ${directionPrompt}
                                
                                OUTPUT: Just the translation string.` 
                            }, 
                            { role: "user", content: userText }
                        ],
                        model: "gpt-4o",
                        max_tokens: 300,
                        temperature: 0.2 // Bajamos temperatura para ser más robótico/preciso
                    });
                    
                    const aiText = completion.choices[0].message.content;
                    if (!aiText || aiText === "SILENCE") return;

                    // Si la traducción es igual al original, es un error (no tradujo)
                    if (stringSimilarity.compareTwoStrings(aiText.toLowerCase(), userText.toLowerCase()) > 0.95) {
                        console.log("⚠️ Error: La IA repitió el texto sin traducir. Bloqueado.");
                        return;
                    }

                    console.log(`🤖 Trad: "${aiText}"`);
                    ws.lastAiResponse = aiText;

                    // 4. TTS (Generar Audio)
                    const mp3Response = await openai.audio.speech.create({ 
                        model: "tts-1", voice: targetVoice, input: aiText, response_format: "aac"
                    });
                    const bufferTTS = Buffer.from(await mp3Response.arrayBuffer());
                    
                    // Enviar
                    ws.send(JSON.stringify({ type: 'audio_stream', audio: bufferTTS.toString('base64') }));
                    
                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: userText, 
                        ai_text: aiText, 
                        audio_payload: bufferTTS.toString('base64') 
                    }));

                } catch (error) { console.error("❌ Live Error:", error.message); }
            }
            
            // =================================================================
            // 📝 MODO CLASSIC (TEXTO - GPT-4o MINI - TAMBIÉN ESTRICTO)
            // =================================================================
            else if (data.type === 'text_input') {
                const requestedTone = data.tone || "Neutral";
                
                try {
                    console.log(`📝 Texto: "${data.text}"`);

                    const stream = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `YOU ARE A TRANSLATOR TOOL.
                                
                                RULES:
                                1. Translate the text from ${langNameA} to ${langNameB} (or vice versa).
                                2. DO NOT ANSWER. DO NOT CHAT.
                                3. Tone: ${requestedTone}.
                                4. Output ONLY the translation.` 
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
                        audio_payload: audioB64 
                    }));
                } catch(e) { console.error("Classic Error:", e.message); }
            }

        } catch (e) { console.error("WS Error:", e.message); }
    });
});