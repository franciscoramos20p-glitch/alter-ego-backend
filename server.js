import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI, { toFile } from 'openai';
import stringSimilarity from 'string-similarity';

dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🔑 TU LLAVE MAESTRA
const APP_INTERNAL_KEY = "AlterEgo_Secure_2026_X9"; 

console.log(`🚀 SERVIDOR V77: FUERZA BRUTA DE IDIOMA Y VOZ ACTIVA`);

// 🛑 FILTROS
const HALLUCINATION_TRIGGERS = [
    "Subtitles by", "Amara.org", "Community", "Translated by", 
    "watching", "Please subscribe", "sous-titres", "captioned", 
    "Solo ves lo que puedes ver", "Thanks for watching", 
    "No olvides suscribirte", "Copyright", "All rights reserved"
];

// 🔥 DICCIONARIO DE IDIOMAS (El Cerebro)
function detectLanguage(rawLang) {
    if (!rawLang) return "English";
    const l = rawLang.toLowerCase();
    
    // Mapeo manual estricto
    if (l.includes('ruso') || l.includes('russian')) return 'Russian'; // 🇷🇺
    if (l.includes('frances') || l.includes('francés') || l.includes('french')) return 'French'; // 🇫🇷
    if (l.includes('aleman') || l.includes('alemán') || l.includes('german')) return 'German'; // 🇩🇪
    if (l.includes('italiano') || l.includes('italian')) return 'Italian'; // 🇮🇹
    if (l.includes('portugues') || l.includes('portugués') || l.includes('portuguese')) return 'Portuguese'; // 🇧🇷
    if (l.includes('chino') || l.includes('chinese')) return 'Chinese'; // 🇨🇳
    if (l.includes('japones') || l.includes('japonés') || l.includes('japanese')) return 'Japanese'; // 🇯🇵
    if (l.includes('ingles') || l.includes('inglés') || l.includes('english')) return 'English'; // 🇺🇸
    if (l.includes('espanol') || l.includes('español') || l.includes('spanish')) return 'Spanish'; // 🇪🇸
    
    // Limpieza de emojis para otros idiomas
    return rawLang.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/gu, '').trim();
}

wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.isAuthenticated = false; 
    ws.lastAiResponse = ""; 

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
                } else {
                    return ws.close();
                }
            }
            if (!ws.isAuthenticated) return;

            // 🔥 1. PROCESAMIENTO DE VOZ (MINÚSCULA OBLIGATORIA)
            let voiceInput = (data.voice || "alloy").toLowerCase().trim();
            const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'ash', 'coral', 'sage'];
            // Si la voz no es válida, usa alloy
            const targetVoice = validVoices.includes(voiceInput) ? voiceInput : "alloy";

            // 🔥 2. PROCESAMIENTO DE IDIOMAS (LIMPIEZA OBLIGATORIA)
            const sourceLang = detectLanguage(data.langSource);
            const targetLang = detectLanguage(data.langTarget);

            console.log(`🗣️ PROCESANDO: ${sourceLang} -> ${targetLang} | Voz: ${targetVoice}`);

            // ----------------------------------------------------
            // 🎙️ MODO AUDIO (LIVE)
            // ----------------------------------------------------
            if (data.type === 'audio_input') {
                const audioBuffer = Buffer.from(data.payload, 'base64');
                try {
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: await toFile(audioBuffer, 'speech.m4a'), 
                        model: "whisper-1",
                        prompt: `Conversation in ${sourceLang} and ${targetLang}.`,
                        temperature: 0 
                    });
                    
                    let userText = transcription.text.trim();
                    if (userText.length < 2 || HALLUCINATION_TRIGGERS.some(t => userText.includes(t))) return;

                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `You are a STRICT INTERPRETER. 
                                Languages: ${sourceLang} <-> ${targetLang}.
                                1. Translate ${sourceLang} to ${targetLang}.
                                2. Translate ${targetLang} to ${sourceLang}.
                                Output ONLY the translation.` 
                            }, 
                            { role: "user", content: userText }
                        ],
                        model: "gpt-4o",
                        max_tokens: 250
                    });
                    
                    const aiText = completion.choices[0].message.content;
                    
                    const mp3Response = await openai.audio.speech.create({ 
                        model: "tts-1", 
                        voice: targetVoice, // USAMOS LA VOZ VALIDADA
                        input: aiText, 
                        response_format: "aac"
                    });
                    
                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: userText, 
                        ai_text: aiText, 
                        audio_payload: Buffer.from(await mp3Response.arrayBuffer()).toString('base64') 
                    }));

                } catch (error) { console.error(error); }
            }
            
            // ----------------------------------------------------
            // 📝 MODO TEXTO (CHAT) - CORREGIDO
            // ----------------------------------------------------
            else if (data.type === 'text_input') {
                const cleanText = data.text.substring(0, 500);
                
                try {
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                // PROMPT SÚPER CLARO
                                content: `Translate the following text from ${sourceLang} to ${targetLang}. 
                                If the text is already in ${targetLang}, translate it back to ${sourceLang}.
                                Style: ${data.tone || "Neutral"}.
                                Output ONLY the translation.` 
                            }, 
                            { role: "user", content: cleanText }
                        ],
                        model: "gpt-4o-mini"
                    });
                    
                    const aiText = completion.choices[0].message.content;
                    
                    const mp3 = await openai.audio.speech.create({ 
                        model: "tts-1", 
                        voice: targetVoice, // USAMOS LA VOZ VALIDADA
                        input: aiText, 
                        response_format: 'aac' 
                    });
                    
                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: cleanText, 
                        ai_text: aiText, 
                        audio_payload: Buffer.from(await mp3.arrayBuffer()).toString('base64') 
                    }));
                } catch(e) { ws.send(JSON.stringify({ type: 'error' })); }
            }

        } catch (e) { console.error("WS Error:", e.message); }
    });
});