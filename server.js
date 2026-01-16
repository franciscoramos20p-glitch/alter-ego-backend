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

console.log(`🚀 SERVIDOR V33 (MASTER BIDIRECCIONAL): Puerto ${PORT}`);

const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// 🛡️ LISTA NEGRA EXTENDIDA (Anti-Basura)
const IGNORE_LIST = [
    "Subtitles by", "Amara.org", "Community", "music playing", 
    "Unresearched", "Thank you", "Suscríbete", "Copyright", 
    "Translated by", "MBC", "watching", "Please subscribe", 
    "Me gusta", "blue skies", "sous-titres", "Silence", "Ruido",
    "subtítulos", "captioned", "Audio", "Transcribe", 
    "música", "aplausos", "risa", "locutor", "voz en off"
];

// 🗺️ 50 IDIOMAS RESTAURADOS
const ISO_LANGS = {
    'Español': 'es', 'Inglés': 'en', 'Francés': 'fr', 'Alemán': 'de', 'Italiano': 'it',
    'Portugués': 'pt', 'Chino': 'zh', 'Japonés': 'ja', 'Coreano': 'ko', 'Ruso': 'ru',
    'Árabe': 'ar', 'Hindi': 'hi', 'Holandés': 'nl', 'Turco': 'tr', 'Polaco': 'pl',
    'Sueco': 'sv', 'Danés': 'da', 'Noruego': 'no', 'Finlandés': 'fi', 'Griego': 'el',
    'Checo': 'cs', 'Húngaro': 'hu', 'Rumano': 'ro', 'Tailandés': 'th', 'Vietnamita': 'vi',
    'Indonesio': 'id', 'Malayo': 'ms', 'Filipino': 'tl', 'Hebreo': 'he', 'Ucraniano': 'uk',
    'Catalán': 'ca', 'Croata': 'hr', 'Eslovaco': 'sk', 'Búlgaro': 'bg', 'Serbio': 'sr'
};

wss.on('connection', (ws) => {
    console.log(`⚡ Cliente Conectado`);

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            // ==========================
            // 🟢 1. INICIO LIVE
            // ==========================
            if (data.type === 'start_realtime_session') {
                console.log("🎙️ Live Iniciado");
                ws.send(JSON.stringify({ type: 'debug', msg: 'Live Bidireccional 🟢' }));
                return;
            }

            // ==========================
            // 🔴 2. PROCESAMIENTO DE AUDIO (LIVE Y CHAT)
            // ==========================
            if (data.type === 'audio_input') {
                const langA = data.langSource || "Spanish";
                const langB = data.langTarget || "English";
                
                console.log(`📨 Audio Recibido (${data.payload.length}b) | Par: ${langA} <-> ${langB}`);

                const inputBuffer = Buffer.from(data.payload, 'base64');
                const tempIn = path.join(tempDir, `in_${Date.now()}_${Math.random()}.m4a`);
                
                try {
                    fs.writeFileSync(tempIn, inputBuffer);

                    // A. TRANSCRIPCIÓN (WHISPER)
                    // Usamos 'prompt' para darle contexto y evitar alucinaciones
                    const transcription = await openai.audio.transcriptions.create({ 
                        file: fs.createReadStream(tempIn), 
                        model: "whisper-1",
                        // NO forzamos lenguaje aquí para permitir que Whisper detecte si es Inglés o Español
                        prompt: "Conversation, clear speech." 
                    });
                    
                    const userText = transcription.text.trim();
                    
                    // B. FILTRO ANTI-BASURA
                    if (userText.length < 2 || IGNORE_LIST.some(x => userText.toLowerCase().includes(x.toLowerCase()))) {
                        console.log(`🗑️ Basura ignorada: "${userText}"`);
                        try { fs.unlinkSync(tempIn); } catch(e){}
                        return; 
                    }

                    console.log(`🗣️ Oído: "${userText}"`);

                    // C. TRADUCCIÓN BIDIRECCIONAL (CEREBRO)
                    const completion = await openai.chat.completions.create({
                        messages: [
                            { 
                                role: "system", 
                                content: `You are a professional BIDIRECTIONAL interpreter between ${langA} and ${langB}.
                                
                                RULES:
                                1. Detect the language of the user input.
                                2. If it is ${langA}, translate it to ${langB}.
                                3. If it is ${langB}, translate it to ${langA}.
                                4. Return ONLY the translation. No explanations.
                                5. If the text makes no sense, return nothing.` 
                            }, 
                            { role: "user", content: userText }
                        ],
                        model: "gpt-4o", 
                        max_tokens: 150
                    });
                    
                    const aiText = completion.choices[0].message.content;
                    if (!aiText || aiText.length < 1) return;

                    console.log(`🧠 Traducción: "${aiText}"`);

                    // D. GENERAR AUDIO (TTS)
                    const mp3Response = await openai.audio.speech.create({ 
                        model: "tts-1", 
                        voice: "alloy", 
                        input: aiText,
                        response_format: "aac" // Más rápido y compatible
                    });
                    
                    const bufferTTS = Buffer.from(await mp3Response.arrayBuffer());

                    // E. RESPONDER (Formato compatible con Live y Chat)
                    // Para Live
                    ws.send(JSON.stringify({ 
                        type: 'audio_stream', 
                        audio: bufferTTS.toString('base64') 
                    }));

                    // Para Chat Clásico (envía texto también)
                    ws.send(JSON.stringify({ 
                        type: 'full_response', 
                        user_text: userText, 
                        ai_text: aiText, 
                        audio_payload: bufferTTS.toString('base64') 
                    }));

                    try { fs.unlinkSync(tempIn); } catch(e){}

                } catch (error) {
                    console.error("❌ Error Procesamiento:", error.message);
                    try { fs.unlinkSync(tempIn); } catch(e){}
                }
            }

            // ==========================
            // 🔵 3. CHAT CLÁSICO (TEXTO DIRECTO)
            // ==========================
            else if (data.type === 'text_input') {
                const langA = data.my_lang || "Spanish";
                const langB = data.language || "English"; // Chat usa 'language' a veces como target

                const completion = await openai.chat.completions.create({
                    messages: [
                        { 
                            role: "system", 
                            content: `You are a BIDIRECTIONAL translator between ${langA} and ${langB}. 
                            If input is ${langA} -> Translate to ${langB}.
                            If input is ${langB} -> Translate to ${langA}.
                            Return ONLY translation.` 
                        },
                        { role: "user", content: data.text }
                    ],
                    model: "gpt-4o"
                });

                const aiText = completion.choices[0].message.content;
                
                const mp3 = await openai.audio.speech.create({ 
                    model: "tts-1", voice: "alloy", input: aiText, response_format: 'aac'
                });
                const buffer = Buffer.from(await mp3.arrayBuffer());

                ws.send(JSON.stringify({ 
                    type: 'full_response', 
                    user_text: data.text, 
                    ai_text: aiText, 
                    audio_payload: buffer.toString('base64') 
                }));
            }

        } catch (e) { console.error("Error WS:", e.message); }
    });
});