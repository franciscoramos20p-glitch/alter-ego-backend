import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI, { toFile } from 'openai';
import stringSimilarity from 'string-similarity';

dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🔑 CLAVE MAESTRA
const APP_INTERNAL_KEY = "AlterEgo_Secure_2026_X9"; 

console.log(`🚀 SERVIDOR V87: SIN FILTROS DE IDIOMA (ARREGLO TOTAL)`);

// 🛑 LISTA NEGRA
const HALLUCINATION_TRIGGERS = [
    "Subtitles by", "Amara.org", "Community", "Translated by", 
    "watching", "Please subscribe", "sous-titres", "captioned", 
    "Solo ves lo que puedes ver", "Thanks for watching", 
    "No olvides suscribirte", "Copyright", "All rights reserved", "suscríbete",
    "DimaTorzok", "ZHUKOV", "Transcribe exactly"
];

// 💓 HEARTBEAT
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => clearInterval(interval));

// ⚡ LÓGICA DE CONEXIÓN
wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.isAuthenticated = false; 
    ws.lastAiResponse = ""; 

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (message) => {
        if (message.length > 10 * 1024 * 1024) return;

        try {
            let data;
            try { data = JSON.parse(message); } catch (e) { return; }

            // AUTH
            if (data.type === 'auth') {
                if (data.token === APP_INTERNAL_KEY) {
                    ws.isAuthenticated = true;
                    return ws.send(JSON.stringify({ type: 'auth_success' }));
                } else { return ws.close(); }
            }
            if (!ws.isAuthenticated) return;
            if (data.type === 'start_realtime_session') return;

            // 🔥 VARIABLES GLOBALES (SIN FILTROS RESTRICTIVOS)
            // Aceptamos lo que venga. Si es "Sueco", pasa "Sueco". Si es "Ruso 🇷🇺", pasa "Ruso 🇷🇺".
            // GPT-4o es listo, entiende emojis.
            const srcLang = data.langSource || data.my_lang || "Spanish";
            const tgtLang = data.langTarget || data.target_lang_code || "English";
            
            // Voz Universal (Limpiamos espacios y mayúsculas)
            let rawVoice = (data.voice || "alloy").toLowerCase().trim();
            const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'ash', 'coral', 'sage'];
            let voice = validVoices.includes(rawVoice) ? rawVoice : "alloy";

            // =================================================================
            // 🎙️ MODO AUDIO (LIVE)
            // =================================================================
            if (data.type === 'audio_input') {
                const audioBuffer = Buffer.from(data.payload, 'base64');
                try {
                    // A. Transcribir
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: await toFile(audioBuffer, 'speech.m4a'), 
                        model: "whisper-1",
                        // Prompt flexible
                        prompt: `Conversation. Source: ${srcLang}. Target: ${tgtLang}.`, 
                        temperature: 0 
                    });
                    
                    let userText = transcription.text.trim();
                    if (userText.length < 2 || HALLUCINATION_TRIGGERS.some(t => userText.includes(t))) return;
                    
                    // LOG VISIBLE
                    console.log(`🗣️ Audio User (${srcLang}): "${userText}"`);

                    if (ws.lastAiResponse) {
                        const similarity = stringSimilarity.compareTwoStrings(userText.toLowerCase(), ws.lastAiResponse.toLowerCase());
                        if (similarity > 0.85) return;
                    }

                    // B. Traducir
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                // PROMPT MAESTRO: Acepta cualquier idioma
                                content: `Translate from ${srcLang} to ${tgtLang}. If input is already ${tgtLang}, translate to ${srcLang}. Output ONLY translation.` 
                            }, 
                            { role: "user", content: userText }
                        ],
                        model: "gpt-4o",
                    });
                    const aiText = completion.choices[0].message.content;
                    ws.lastAiResponse = aiText;

                    console.log(`🧠 Audio AI (${tgtLang}): "${aiText}" | Voz: ${voice}`);

                    // C. Hablar
                    const mp3Response = await openai.audio.speech.create({ 
                        model: "tts-1", 
                        voice: voice, 
                        input: aiText, 
                        response_format: "aac"
                    });
                    const bufferTTS = Buffer.from(await mp3Response.arrayBuffer());
                    
                    ws.send(JSON.stringify({ type: 'audio_stream', audio: bufferTTS.toString('base64') }));
                    ws.send(JSON.stringify({ type: 'full_response', user_text: userText, ai_text: aiText, audio_payload: bufferTTS.toString('base64') }));

                } catch (error) { console.error("Error Live:", error.message); }
            }
            
            // =================================================================
            // 📝 MODO TEXTO (CHAT)
            // =================================================================
            else if (data.type === 'text_input') {
                const cleanText = data.text.substring(0, 500);
                console.log(`📝 Chat User (${srcLang}): "${cleanText}"`);
                
                try {
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `Translate from ${srcLang} to ${tgtLang}. If input is already ${tgtLang}, translate to ${srcLang}. Tone: ${data.tone || "Neutral"}. Output ONLY translation.` 
                            }, 
                            { role: "user", content: cleanText }
                        ],
                        model: "gpt-4o-mini"
                    });
                    const aiText = completion.choices[0].message.content;
                    ws.lastAiResponse = aiText;
                    
                    console.log(`🧠 Chat AI (${tgtLang}): "${aiText}"`);

                    const mp3 = await openai.audio.speech.create({ 
                        model: "tts-1", 
                        voice: voice, 
                        input: aiText, 
                        response_format: 'aac' 
                    });
                    
                    ws.send(JSON.stringify({ type: 'full_response', user_text: cleanText, ai_text: aiText, audio_payload: Buffer.from(await mp3.arrayBuffer()).toString('base64') }));
                } catch(e) { ws.send(JSON.stringify({ type: 'error' })); }
            }

        } catch (e) { console.error("WS Error:", e.message); }
    });
});