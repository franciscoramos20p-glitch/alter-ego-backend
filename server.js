import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI, { toFile } from 'openai';
import stringSimilarity from 'string-similarity';

// Cargar variables de entorno
dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 SERVIDOR V89 [TURBO]: Detecta Idioma, Audio AAC Rápido. Puerto: ${PORT}`);

// 🛡️ LISTA NEGRA (Anti-Basura)
const HALLUCINATION_TRIGGERS = [
    "Subtitles by", "Amara.org", "Community", "Translated by", 
    "watching", "Please subscribe", "sous-titres", "captioned",
    "Solo ves lo que puedes ver", "Gracias por ver", "Thanks for watching", 
    "No olvides suscribirte", "Copyright", "All rights reserved", "suscríbete",
    "DimaTorzok", "ZHUKOV", "Proyecto Touhou", "obra derivada",
    "Transcribe exactly", "lo que se dice", "Transcribir exactamente", 
    "Direct conversation", "MBC", "SBS"
];

// 💓 HEARTBEAT (Mantiene la conexión viva)
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
wss.on('connection', (ws) => {
    console.log(`⚡ Cliente Conectado`);
    ws.isAlive = true;
    ws.lastAiResponse = ""; 

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (message) => {
        try {
            // Parseo seguro
            let data;
            try { data = JSON.parse(message); } catch (e) { return; }

            if (data.type === 'start_realtime_session' || data.type === 'ping') return;
            
            // Auth falsa para que la app no se trabe
            if (data.type === 'auth') {
                ws.send(JSON.stringify({ type: 'auth_success', credits: 999 })); 
                return;
            }

            const targetVoice = data.voice || "alloy"; 

            // =================================================================
            // 🎙️ AUDIO INPUT (LIVE - MODO VELOCIDAD MÁXIMA)
            // =================================================================
            if (data.type === 'audio_input') {
                if (!data.payload) return;

                const rawLangA = data.langSource || "Español";
                const rawLangB = data.langTarget || "Inglés";
                const audioBuffer = Buffer.from(data.payload, 'base64');
                
                try {
                    // 1. WHISPER (Con detección de idioma explícita)
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: await toFile(audioBuffer, 'speech.m4a'), 
                        model: "whisper-1",
                        // 🔥 'verbose_json' nos da el idioma detectado
                        response_format: "verbose_json", 
                        prompt: "Conversation. Dialogue. Hola. Hello.", 
                        temperature: 0 
                    });
                    
                    let userText = transcription.text.trim();
                    let detectedLang = transcription.language; // <--- AQUÍ ESTÁ EL IDIOMA

                    // 🛡️ LOG PARA TI: Verás qué idioma detectó
                    console.log(`🌍 Idioma Detectado: [${detectedLang}] - Texto: "${userText}"`);
                    
                    // Filtros Anti-Basura Rápidos
                    if (userText.length < 2) return; 
                    if (HALLUCINATION_TRIGGERS.some(t => userText.toLowerCase().includes(t.toLowerCase()))) {
                        console.log(`🔇 Basura ignorada.`); return; 
                    }
                    if (ws.lastAiResponse && stringSimilarity.compareTwoStrings(userText.toLowerCase(), ws.lastAiResponse.toLowerCase()) > 0.85) return;

                    // 2. GPT-4o (Traducción Directa y Rápida)
                    // Prompt optimizado para velocidad (menos tokens de entrada)
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `STRICT TRANSLATOR. 
                                Langs: ${rawLangA} <-> ${rawLangB}.
                                Rule: Detect input lang -> Translate to other.
                                Output: TRANSLATION ONLY. NO CHAT.` 
                            }, 
                            { role: "user", content: userText }
                        ],
                        model: "gpt-4o",
                        max_tokens: 150, // Limitamos para que responda rápido
                    });
                    
                    const aiText = completion.choices[0].message.content;
                    if (!aiText || aiText === "SILENCE") return;
                    
                    // Verificación anti-eco rápida
                    if (stringSimilarity.compareTwoStrings(aiText.toLowerCase(), userText.toLowerCase()) > 0.9) return;

                    console.log(`🚀 Trad: "${aiText}"`);
                    ws.lastAiResponse = aiText;

                    // 3. TTS (Generación de Audio Optimizada)
                    const mp3Response = await openai.audio.speech.create({ 
                        model: "tts-1", // El modelo más rápido
                        voice: targetVoice, 
                        input: aiText, 
                        response_format: "aac" // 🔥 AAC es más rápido de transferir que MP3
                    });
                    const bufferTTS = Buffer.from(await mp3Response.arrayBuffer());
                    
                    // ⚡ RESPUESTA INSTANTÁNEA
                    // Enviamos audio primero
                    ws.send(JSON.stringify({ type: 'audio_stream', audio: bufferTTS.toString('base64') }));
                    
                    // Luego datos para historial
                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: userText, 
                        ai_text: aiText, 
                        audio_payload: bufferTTS.toString('base64') 
                    }));

                } catch (error) { 
                    console.error("❌ Error Live:", error.message);
                }
            }
            
            // =================================================================
            // 📝 CHAT DE TEXTO (CLASSIC)
            // =================================================================
            else if (data.type === 'text_input') {
                const systemPrompt = data.tone || `Translate input.`; 
                try {
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { role: "system", content: systemPrompt }, 
                            { role: "user", content: data.text }
                        ],
                        model: "gpt-4o-mini"
                    });
                    const aiText = completion.choices[0].message.content;
                    ws.lastAiResponse = aiText;
                    
                    const mp3 = await openai.audio.speech.create({ 
                        model: "tts-1", voice: targetVoice, input: aiText, response_format: 'aac' 
                    });
                    const buffer = Buffer.from(await mp3.arrayBuffer());
                    
                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: data.text, 
                        ai_text: aiText, 
                        audio_payload: buffer.toString('base64') 
                    }));
                } catch(e) {}
            }

        } catch (e) { console.error("🔥 WS Error:", e.message); }
    });
});