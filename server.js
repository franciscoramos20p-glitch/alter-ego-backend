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

console.log(`🚀 SERVIDOR V86: UNIVERSAL + LOGS COMPLETOS (V75 STYLE)`);

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

// 🧠 DETECTOR INTELIGENTE DE IDIOMA (Acepta variables viejas y nuevas)
function resolveLanguage(val1, val2) {
    const val = val1 || val2 || "English";
    const l = val.toLowerCase();
    
    if (l.includes('ruso') || l.includes('russian')) return 'Russian';
    if (l.includes('español') || l.includes('spanish')) return 'Spanish';
    if (l.includes('inglés') || l.includes('english')) return 'English';
    if (l.includes('francés') || l.includes('french')) return 'French';
    if (l.includes('alemán') || l.includes('german')) return 'German';
    if (l.includes('italiano') || l.includes('italian')) return 'Italian';
    if (l.includes('portugués') || l.includes('portuguese')) return 'Portuguese';
    if (l.includes('chino') || l.includes('chinese')) return 'Chinese';
    if (l.includes('japonés') || l.includes('japanese')) return 'Japanese';
    
    return "English"; 
}

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

            // 🔥 1. VARIABLES GLOBALES (Para que funcionen en Audio y Chat)
            const srcLang = resolveLanguage(data.langSource, data.my_lang);
            const tgtLang = resolveLanguage(data.langTarget, data.target_lang_code); // Soporte retroactivo
            
            let rawVoice = data.voice || "alloy";
            let validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'ash', 'coral', 'sage'];
            let voice = validVoices.includes(rawVoice.toLowerCase().trim()) ? rawVoice.toLowerCase().trim() : "alloy";

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
                        prompt: `Conversation in ${srcLang} and ${tgtLang}.`, 
                        temperature: 0 
                    });
                    
                    let userText = transcription.text.trim();
                    if (userText.length < 2 || HALLUCINATION_TRIGGERS.some(t => userText.includes(t))) return;
                    
                    // 🔥 LOG RESTAURADO (Aquí verás lo que dices)
                    console.log(`🗣️ User (${srcLang}): "${userText}"`);

                    if (ws.lastAiResponse) {
                        const similarity = stringSimilarity.compareTwoStrings(userText.toLowerCase(), ws.lastAiResponse.toLowerCase());
                        if (similarity > 0.85) return;
                    }

                    // B. Traducir
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { role: "system", content: `Translate from ${srcLang} to ${tgtLang}. If already ${tgtLang}, translate to ${srcLang}. Output ONLY translation.` }, 
                            { role: "user", content: userText }
                        ],
                        model: "gpt-4o",
                    });
                    const aiText = completion.choices[0].message.content;
                    ws.lastAiResponse = aiText;

                    // 🔥 LOG RESTAURADO (Aquí verás la traducción)
                    console.log(`🧠 AI (${tgtLang}): "${aiText}" | Voz: ${voice}`);

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
                // 🔥 LOG PARA CHAT
                console.log(`📝 Chat (${srcLang}): "${cleanText}"`);
                
                try {
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { role: "system", content: `Translate from ${srcLang} to ${tgtLang}. If already ${tgtLang}, translate to ${srcLang}. Tone: ${data.tone || "Neutral"}. Output ONLY translation.` }, 
                            { role: "user", content: cleanText }
                        ],
                        model: "gpt-4o-mini"
                    });
                    const aiText = completion.choices[0].message.content;
                    ws.lastAiResponse = aiText;
                    
                    // 🔥 LOG PARA CHAT
                    console.log(`🧠 AI Chat (${tgtLang}): "${aiText}"`);

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