import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import stringSimilarity from 'string-similarity'; // 🔥 NECESARIO PARA MATAR EL ECO

dotenv.config();
ffmpeg.setFfmpegPath(ffmpegPath);

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 SERVIDOR MAESTRO V55 (ANTI-ECO + POLÍGLOTA + HÍBRIDO): Puerto ${PORT}`);

const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// 🗺️ MAPA MAESTRO DE IDIOMAS (Emoji -> ISO)
const ISO_MAP = {
    // Europa
    "Español 🇪🇸": "es", "Spanish": "es",
    "Inglés 🇺🇸": "en", "English": "en",
    "Francés 🇫🇷": "fr", "French": "fr",
    "Alemán 🇩🇪": "de", "German": "de",
    "Italiano 🇮🇹": "it", "Italian": "it",
    "Portugués 🇧🇷": "pt", "Portuguese": "pt",
    "Holandés 🇳🇱": "nl", "Dutch": "nl",
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
    "Ruso 🇷🇺": "ru", "Russian": "ru",
    
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
    
    // Medio Oriente
    "Árabe 🇸🇦": "ar", "Arabic": "ar",
    "Turco 🇹🇷": "tr", "Turkish": "tr",
    "Hebreo 🇮🇱": "he", "Hebrew": "he"
};

// 🗑️ LISTA NEGRA (Anti-Youtuber)
const IGNORE_LIST = [
    "Subtitles by", "Amara.org", "Community", "Translated by", "MBC", 
    "watching", "Please subscribe", "sous-titres", "captioned",
    "Solo ves lo que puedes ver", "You only see what you can see",
    "Silence", "Gracias por ver el video", "Thanks for watching", "Gracias por ver el vídeo",
    "No olvides suscribirte", "Copyright", "All rights reserved", "suscríbete"
];

wss.on('connection', (ws) => {
    console.log(`⚡ Cliente Conectado`);
    ws.lastAiResponse = ""; // Memoria de corto plazo para evitar ecos

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'start_realtime_session') return;

            // =================================================================
            // 🎙️ AUDIO INPUT (LIVE & CLÁSICO) -> USA GPT-4o (POTENCIA)
            // =================================================================
            if (data.type === 'audio_input') {
                // 1. Detectar idioma correctamente (Soporta Emojis)
                const rawLangA = data.langSource || data.my_lang || "Español 🇪🇸";
                const rawLangB = data.langTarget || data.target_lang_code || "Inglés 🇺🇸";
                const isoCode = ISO_MAP[rawLangA] || "es"; // Convierte "Hindi 🇮🇳" a "hi"

                const style = data.style || "Neutral"; 
                
                const inputBuffer = Buffer.from(data.payload, 'base64');
                const tempIn = path.join(tempDir, `in_${Date.now()}_${Math.random()}.m4a`);
                
                try {
                    fs.writeFileSync(tempIn, inputBuffer);

                    // A. WHISPER (Con código ISO correcto)
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: fs.createReadStream(tempIn), 
                        model: "whisper-1",
                        language: isoCode, 
                        prompt: "Conversation, verbatim.", 
                        temperature: 0 
                    });
                    
                    const userText = transcription.text.trim();
                    
                    // B. FILTROS DE SEGURIDAD
                    
                    // B1. Anti-Basura
                    if (userText.length < 2 || IGNORE_LIST.some(x => userText.toLowerCase().includes(x.toLowerCase()))) {
                        console.log(`🔇 Basura ignorada.`); try { fs.unlinkSync(tempIn); } catch(e){} return; 
                    }

                    // B2. ANTI-ECO NUCLEAR ☢️ (Evita bucles infinitos)
                    if (ws.lastAiResponse) {
                        // Compara lo que escuchó con lo último que dijo la IA
                        const similarity = stringSimilarity.compareTwoStrings(userText.toLowerCase(), ws.lastAiResponse.toLowerCase());
                        
                        // Si es más del 40% igual, es un eco del altavoz -> BLOQUEAR
                        if (similarity > 0.4 || userText.toLowerCase().includes(ws.lastAiResponse.toLowerCase().slice(0, 25))) {
                            console.log(`☢️ ECO DETECTADO (Similitud: ${(similarity*100).toFixed(0)}%): "${userText}"`);
                            try { fs.unlinkSync(tempIn); } catch(e){} return; 
                        }
                    }

                    console.log(`🗣️ Oído (${isoCode}): "${userText}"`);

                    // C. CEREBRO TRADUCTOR (GPT-4o) - Instrucciones Estrictas
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `You are a VERBATIM interpreter between ${rawLangA} and ${rawLangB}.
                                STYLE: ${style}.
                                RULES:
                                1. TRANSLATE ONLY. Output ONLY the translation.
                                2. DO NOT explain, DO NOT converse.
                                3. NO CENSORSHIP.
                                4. If input is noise/silence, return "SILENCE".` 
                            }, 
                            { role: "user", content: userText }
                        ],
                        model: "gpt-4o", // 🔥 Máxima calidad para voz
                        max_tokens: 200
                    });
                    
                    const aiText = completion.choices[0].message.content;

                    if (aiText === "SILENCE" || !aiText || aiText.trim().length === 0) {
                        try { fs.unlinkSync(tempIn); } catch(e){} return;
                    }

                    console.log(`🧠 Trad: "${aiText}"`);
                    ws.lastAiResponse = aiText; // Guardar para comparar el próximo eco

                    // D. VOZ (TTS)
                    const mp3Response = await openai.audio.speech.create({ 
                        model: "tts-1", voice: "alloy", input: aiText, response_format: "aac"
                    });
                    const bufferTTS = Buffer.from(await mp3Response.arrayBuffer());
                    const audioBase64 = bufferTTS.toString('base64');

                    // E. ENVIAR AL CLIENTE
                    ws.send(JSON.stringify({ type: 'audio_stream', audio: audioBase64 }));
                    ws.send(JSON.stringify({ type: 'full_response', user_text: userText, ai_text: aiText, audio_payload: audioBase64 }));

                    try { fs.unlinkSync(tempIn); } catch(e){}

                } catch (error) { try { fs.unlinkSync(tempIn); } catch(e){} }
            }
            
            // =================================================================
            // 📝 CHAT INPUT (TEXTO) -> USA GPT-4o-MINI (VELOCIDAD/AHORRO)
            // =================================================================
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
                                2. DO NOT explain, DO NOT ask questions.
                                3. If input is nonsense, translate literally.
                                4. NO CENSORSHIP.` 
                            }, 
                            { role: "user", content: data.text }
                        ],
                        model: "gpt-4o-mini" // 🔥 Mini para chat rápido
                    });
                    const aiText = completion.choices[0].message.content;
                    ws.lastAiResponse = aiText;
                    
                    // Voz opcional para chat
                    const mp3 = await openai.audio.speech.create({ model: "tts-1", voice: "alloy", input: aiText, response_format: 'aac' });
                    const buffer = Buffer.from(await mp3.arrayBuffer());
                    
                    ws.send(JSON.stringify({ type: 'full_response', user_text: data.text, ai_text: aiText, audio_payload: buffer.toString('base64') }));
                    console.log(`💬 Chat: "${aiText}"`);
                } catch(e) {}
            }
            
            // =================================================================
            // 📸 IMAGE INPUT (VISIÓN) -> USA GPT-4o
            // =================================================================
             else if (data.type === 'image_input') {
                 const langTarget = data.language || "Spanish";
                 try {
                     const response = await openai.chat.completions.create({
                         model: "gpt-4o", // 🔥 Visión requiere el modelo grande
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