import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

dotenv.config();
ffmpeg.setFfmpegPath(ffmpegPath);

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 SERVIDOR V53 (POLÍGLOTA 30 IDIOMAS + EMOJIS): Puerto ${PORT}`);

const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// 🗺️ MAPA MAESTRO: Traduce lo que envía la App (Con Emojis) al código ISO que necesita Whisper
const ISO_MAP = {
    // Europa Occidental
    "Español 🇪🇸": "es", "Spanish": "es",
    "Inglés 🇺🇸": "en", "English": "en",
    "Francés 🇫🇷": "fr", "French": "fr",
    "Alemán 🇩🇪": "de", "German": "de",
    "Italiano 🇮🇹": "it", "Italian": "it",
    "Portugués 🇧🇷": "pt", "Portuguese": "pt",
    "Holandés 🇳🇱": "nl", "Dutch": "nl",
    
    // Asia
    "Chino 🇨🇳": "zh", "Chinese": "zh",
    "Japonés 🇯🇵": "ja", "Japanese": "ja",
    "Coreano 🇰🇷": "ko", "Korean": "ko",
    "Hindi 🇮🇳": "hi", "Hindi": "hi",
    "Tailandés 🇹🇭": "th", "Thai": "th",
    "Vietnamita 🇻🇳": "vi", "Vietnamese": "vi",
    "Indonesio 🇮🇩": "id", "Indonesian": "id",
    "Malayo 🇲🇾": "ms", "Malay": "ms",
    "Filipino 🇵🇭": "tl", "Tagalog": "tl",
    
    // Europa Oriental / Nórdicos
    "Ruso 🇷🇺": "ru", "Russian": "ru",
    "Polaco 🇵🇱": "pl", "Polish": "pl",
    "Sueco 🇸🇪": "sv", "Swedish": "sv",
    "Danés 🇩🇰": "da", "Danish": "da",
    "Noruego 🇳🇴": "no", "Norwegian": "no",
    "Finlandés 🇫🇮": "fi", "Finnish": "fi",
    "Griego 🇬🇷": "el", "Greek": "el",
    "Checo 🇨🇿": "cs", "Czech": "cs",
    "Húngaro 🇭🇺": "hu", "Hungarian": "hu",
    "Rumano 🇷🇴": "ro", "Romanian": "ro",
    "Ucraniano 🇺🇦": "uk", "Ukrainian": "uk",
    
    // Medio Oriente
    "Árabe 🇸🇦": "ar", "Arabic": "ar",
    "Turco 🇹🇷": "tr", "Turkish": "tr",
    "Hebreo 🇮🇱": "he", "Hebrew": "he"
};

const IGNORE_LIST = [
    "Subtitles by", "Amara.org", "Community", "Translated by", "MBC", 
    "watching", "Please subscribe", "sous-titres", "captioned",
    "Solo ves lo que puedes ver", "You only see what you can see",
    "Silence", "Gracias por ver el video", "Thanks for watching", 
    "No olvides suscribirte", "Copyright", "All rights reserved"
];

wss.on('connection', (ws) => {
    console.log(`⚡ Cliente Conectado`);
    ws.lastAiResponse = ""; 

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'start_realtime_session') return;

            // ==========================================
            // 🎙️ LIVE / CLÁSICO (AUDIO) -> GPT-4o
            // ==========================================
            if (data.type === 'audio_input') {
                // 🔥 MAGIA AQUÍ: Detectamos si viene de Live (langSource) o Clásico (my_lang)
                const rawLangA = data.langSource || data.my_lang || "Español 🇪🇸";
                const rawLangB = data.langTarget || data.target_lang_code || "Inglés 🇺🇸";
                
                // Convertimos el nombre con Emoji al código ISO (ej: "Hindi 🇮🇳" -> "hi")
                const isoCode = ISO_MAP[rawLangA] || "es"; 

                const style = data.style || "Neutral"; 
                
                const inputBuffer = Buffer.from(data.payload, 'base64');
                const tempIn = path.join(tempDir, `in_${Date.now()}_${Math.random()}.m4a`);
                
                try {
                    fs.writeFileSync(tempIn, inputBuffer);

                    // 1. Oído (Whisper) - AHORA CON ISO CORRECTO
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: fs.createReadStream(tempIn), 
                        model: "whisper-1",
                        language: isoCode, // ¡Ahora sí entiende Hindi, Ruso, etc!
                        prompt: "Conversation, verbatim.", 
                        temperature: 0 
                    });
                    
                    const userText = transcription.text.trim();
                    
                    // 2. Filtros
                    if (ws.lastAiResponse && userText.toLowerCase().includes(ws.lastAiResponse.toLowerCase().slice(0, -1))) {
                        console.log(`🔁 Eco detectado.`); try { fs.unlinkSync(tempIn); } catch(e){} return; 
                    }
                    if (userText.length < 2 || IGNORE_LIST.some(x => userText.toLowerCase().includes(x.toLowerCase()))) {
                        console.log(`🔇 Basura ignorada.`); try { fs.unlinkSync(tempIn); } catch(e){} return; 
                    }

                    console.log(`🗣️ Oído (${isoCode}): "${userText}"`);

                    // 3. Cerebro (GPT-4o para VOZ)
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `You are a VERBATIM interpreter between ${rawLangA} and ${rawLangB}.
                                STYLE: ${style}.
                                RULES:
                                1. TRANSLATE EVERYTHING. No censorship.
                                2. DO NOT SUMMARIZE.
                                3. NEVER reply in the same language.
                                4. If input is noise, return "SILENCE".` 
                            }, 
                            { role: "user", content: userText }
                        ],
                        model: "gpt-4o", 
                        max_tokens: 200
                    });
                    
                    const aiText = completion.choices[0].message.content;

                    if (aiText === "SILENCE" || aiText.toLowerCase().trim() === userText.toLowerCase().trim()) {
                        try { fs.unlinkSync(tempIn); } catch(e){} return;
                    }

                    console.log(`🧠 Trad: "${aiText}"`);
                    ws.lastAiResponse = aiText; 

                    // 4. Voz
                    const mp3Response = await openai.audio.speech.create({ 
                        model: "tts-1", voice: "alloy", input: aiText, response_format: "aac"
                    });
                    const bufferTTS = Buffer.from(await mp3Response.arrayBuffer());
                    const audioBase64 = bufferTTS.toString('base64');

                    ws.send(JSON.stringify({ type: 'audio_stream', audio: audioBase64 }));
                    ws.send(JSON.stringify({ type: 'full_response', user_text: userText, ai_text: aiText, audio_payload: audioBase64 }));

                    try { fs.unlinkSync(tempIn); } catch(e){}

                } catch (error) { try { fs.unlinkSync(tempIn); } catch(e){} }
            }
            
            // ==========================================
            // 📝 CHAT (TEXTO) -> GPT-4o-MINI (MODO MÁQUINA)
            // ==========================================
            else if (data.type === 'text_input') {
                const langA = data.my_lang || "Español 🇪🇸";
                const langB = data.language || "Inglés 🇺🇸";
                const style = data.style || "Neutral";
                try {
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `You are a STRICT TRANSLATION ENGINE from ${langA} to ${langB}. 
                                Style: ${style}.
                                CRITICAL RULES:
                                1. Output ONLY the translation. Nothing else.
                                2. DO NOT explain, DO NOT ask questions, DO NOT converse.
                                3. If the input is nonsense, random letters, or numbers, translate it literally or return it as is.
                                4. Do not censor.` 
                            }, 
                            { role: "user", content: data.text }
                        ],
                        model: "gpt-4o-mini"
                    });
                    const aiText = completion.choices[0].message.content;
                    ws.lastAiResponse = aiText;
                    
                    const mp3 = await openai.audio.speech.create({ model: "tts-1", voice: "alloy", input: aiText, response_format: 'aac' });
                    const buffer = Buffer.from(await mp3.arrayBuffer());
                    
                    ws.send(JSON.stringify({ type: 'full_response', user_text: data.text, ai_text: aiText, audio_payload: buffer.toString('base64') }));
                    console.log(`💬 Chat: "${aiText}"`);
                } catch(e) {}
            }
            
            // 📸 CÁMARA
             else if (data.type === 'image_input') {
                 const langTarget = data.language || "Spanish";
                 try {
                     const response = await openai.chat.completions.create({
                         model: "gpt-4o",
                         messages: [{ role: "user", content: [{ type: "text", text: `Describe briefly in ${langTarget}.` }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.payload}` } }] }],
                         max_tokens: 150,
                     });
                     const aiText = response.choices[0].message.content;
                     ws.lastAiResponse = aiText;
                     const mp3 = await openai.audio.speech.create({ model: "tts-1", voice: "alloy", input: aiText, response_format: 'aac' });
                     const buffer = Buffer.from(await mp3.arrayBuffer());
                     ws.send(JSON.stringify({ type: 'full_response', user_text: "[Imagen]", ai_text: aiText, audio_payload: buffer.toString('base64') }));
                 } catch (e) {}
             }

        } catch (e) { console.error("WS Error:", e.message); }
    });
});