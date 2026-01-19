import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI, { toFile } from 'openai';
import stringSimilarity from 'string-similarity';

dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🔑 TU LLAVE DE SEGURIDAD
const APP_INTERNAL_KEY = "AlterEgo_Secure_2026_X9"; 

console.log(`🚀 SERVIDOR V76: LENGUAJES ESTRICTOS + VOZ CORREGIDA`);

// 🛑 FILTROS ANTI-ALUCINACIÓN
const HALLUCINATION_TRIGGERS = [
    "Subtitles by", "Amara.org", "Community", "Translated by", 
    "watching", "Please subscribe", "sous-titres", "captioned", 
    "Solo ves lo que puedes ver", "Thanks for watching", 
    "No olvides suscribirte", "Copyright", "All rights reserved", 
    "DimaTorzok", "ZHUKOV", "Proyecto Touhou", "Transcribe exactly"
];

const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => clearInterval(interval));

// 🔥 FUNCIÓN PARA TRADUCIR NOMBRES DE IDIOMAS (EL CEREBRO DEL POLÍGLOTA)
function normalizeLanguage(lang) {
    if (!lang) return "English";
    const l = lang.toLowerCase();
    if (l.includes('espanol') || l.includes('español')) return 'Spanish';
    if (l.includes('ingles') || l.includes('inglés')) return 'English';
    if (l.includes('ruso') || l.includes('russian')) return 'Russian'; // 🇷🇺 ARREGLADO
    if (l.includes('frances') || l.includes('francés')) return 'French';
    if (l.includes('aleman') || l.includes('alemán')) return 'German';
    if (l.includes('italiano')) return 'Italian';
    if (l.includes('portugues') || l.includes('portugués')) return 'Portuguese';
    if (l.includes('chino') || l.includes('chinese')) return 'Chinese';
    if (l.includes('japones') || l.includes('japonés')) return 'Japanese';
    // Si no coincide, devolvemos el original limpio
    return lang.replace(/[\u{1F600}-\u{1F64F}]/gu, '').trim();
}

wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.isAuthenticated = false; 
    ws.lastAiResponse = ""; 

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (message) => {
        if (message.length > 10 * 1024 * 1024) return; // Bloqueo anti-crash

        try {
            let data;
            try { data = JSON.parse(message); } catch (e) { return; }

            if (data.type === 'auth') {
                if (data.token === APP_INTERNAL_KEY) {
                    ws.isAuthenticated = true;
                    return ws.send(JSON.stringify({ type: 'auth_success' }));
                } else {
                    return ws.close();
                }
            }

            if (!ws.isAuthenticated) return;
            if (data.type === 'start_realtime_session') return;

            // 🔥 FIX DE VOZ: FORZAMOS MINÚSCULA AQUÍ
            // Así aunque la App mande "Ash", aquí lo convertimos a "ash"
            let targetVoice = (data.voice || "alloy").toLowerCase();
            const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'ash', 'coral', 'sage'];
            if (!validVoices.includes(targetVoice)) targetVoice = "alloy";

            // 🔥 FIX DE IDIOMAS: NORMALIZAMOS AQUÍ
            const sourceLang = normalizeLanguage(data.langSource || "Spanish");
            const targetLang = normalizeLanguage(data.langTarget || "English");

            // =================================================================
            // 🎙️ MODO AUDIO (LIVE)
            // =================================================================
            if (data.type === 'audio_input') {
                const audioBuffer = Buffer.from(data.payload, 'base64');
                
                try {
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: await toFile(audioBuffer, 'speech.m4a'), 
                        model: "whisper-1",
                        prompt: `Conversation in ${sourceLang} or ${targetLang}.`,
                        temperature: 0 
                    });
                    
                    let userText = transcription.text.trim();
                    if (userText.length < 2 || HALLUCINATION_TRIGGERS.some(t => userText.includes(t))) return;

                    // Filtro Anti-Eco
                    if (ws.lastAiResponse) {
                        const similarity = stringSimilarity.compareTwoStrings(userText.toLowerCase(), ws.lastAiResponse.toLowerCase());
                        if (similarity > 0.85) return;
                    }

                    // Prompt Estricto
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `You are a STRICT INTERPRETER. 
                                Translate from ${sourceLang} to ${targetLang}.
                                If input is already ${targetLang}, translate to ${sourceLang}.
                                Output ONLY the translation.` 
                            }, 
                            { role: "user", content: userText }
                        ],
                        model: "gpt-4o",
                        max_tokens: 250
                    });
                    
                    const aiText = completion.choices[0].message.content;
                    ws.lastAiResponse = aiText;

                    const mp3Response = await openai.audio.speech.create({ 
                        model: "tts-1", 
                        voice: targetVoice, // Usamos la voz corregida
                        input: aiText, 
                        response_format: "aac"
                    });
                    const bufferTTS = Buffer.from(await mp3Response.arrayBuffer());
                    
                    ws.send(JSON.stringify({ type: 'audio_stream', audio: bufferTTS.toString('base64') }));
                    ws.send(JSON.stringify({ type: 'full_response', user_text: userText, ai_text: aiText, audio_payload: bufferTTS.toString('base64') }));

                } catch (error) { console.error(error); }
            }
            
            // =================================================================
            // 📝 MODO TEXTO (CHAT CLÁSICO) - ¡AHORA BLINDADO!
            // =================================================================
            else if (data.type === 'text_input') {
                const cleanText = data.text.substring(0, 500);
                
                try {
                    // 🔥 AQUI ESTABA EL ERROR: ANTES SOLO USABA "TONE"
                    // AHORA CONSTRUIMOS EL PROMPT NOSOTROS MISMOS
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `Translate this text from ${sourceLang} to ${targetLang}. 
                                If it is already in ${targetLang}, translate to ${sourceLang}.
                                Style: ${data.tone || "Neutral"}.
                                Output ONLY the translation.` 
                            }, 
                            { role: "user", content: cleanText }
                        ],
                        model: "gpt-4o-mini"
                    });
                    const aiText = completion.choices[0].message.content;
                    ws.lastAiResponse = aiText;
                    
                    const mp3 = await openai.audio.speech.create({ 
                        model: "tts-1", 
                        voice: targetVoice, // Usamos la voz corregida
                        input: aiText, 
                        response_format: 'aac' 
                    });
                    
                    ws.send(JSON.stringify({ type: 'full_response', user_text: cleanText, ai_text: aiText, audio_payload: Buffer.from(await mp3.arrayBuffer()).toString('base64') }));
                } catch(e) { ws.send(JSON.stringify({ type: 'error' })); }
            }
            
             // MODO VISIÓN (CÁMARA) - SI LO USARAS
             else if (data.type === 'image_input') {
                 // ... código de visión (opcional)
             }

        } catch (e) { console.error("WS Error:", e.message); }
    });
});