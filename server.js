import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

dotenv.config();

// ✅ 1. CONFIGURACIÓN FFMPEG (OBLIGATORIA)
ffmpeg.setFfmpegPath(ffmpegPath);

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 SERVIDOR V13 (FULL LANGUAGES + BIDIRECTIONAL): Puerto ${PORT}`);

const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// 🛡️ LISTA NEGRA (CHAT CLÁSICO)
const HALLUCINATIONS = [
    "Subtitles by", "Amara.org", "Community", "music playing", 
    "Unresearched", "Thank you", "Suscríbete", "Copyright", 
    "Translated by", "MBC", "SBS", "provided by", "watching",
    "Please subscribe", "Me gusta", "blue skies", "sous-titres",
    "Silence", "Ruido", "Noise", "www.", ".com", "Sucedió",
    "subtítulos", "captioned", "Audio", "Transcribe", 
    "música", "aplausos", "risa", "locutor", "voz en off"
];

// 🗺️ LISTA COMPLETA DE 50 IDIOMAS RESTAURADA
const ISO_LANGS = {
    'Español': 'es', 'Inglés': 'en', 'Francés': 'fr', 'Alemán': 'de', 'Italiano': 'it',
    'Portugués': 'pt', 'Chino': 'zh', 'Japonés': 'ja', 'Coreano': 'ko', 'Ruso': 'ru',
    'Árabe': 'ar', 'Hindi': 'hi', 'Holandés': 'nl', 'Turco': 'tr', 'Polaco': 'pl',
    'Sueco': 'sv', 'Danés': 'da', 'Noruego': 'no', 'Finlandés': 'fi', 'Griego': 'el',
    'Checo': 'cs', 'Húngaro': 'hu', 'Rumano': 'ro', 'Tailandés': 'th', 'Vietnamita': 'vi',
    'Indonesio': 'id', 'Malayo': 'ms', 'Filipino': 'tl', 'Hebreo': 'he', 'Ucraniano': 'uk',
    'Catalán': 'ca', 'Croata': 'hr', 'Eslovaco': 'sk', 'Búlgaro': 'bg', 'Serbio': 'sr',
    'Lituano': 'lt', 'Letón': 'lv', 'Estonio': 'et', 'Esloveno': 'sl', 'Islandés': 'is',
    'Persa': 'fa', 'Urdu': 'ur', 'Bengalí': 'bn', 'Tamil': 'ta', 'Telugu': 'te',
    'Marathi': 'mr', 'Swahili': 'sw', 'Afrikáans': 'af', 'Galés': 'cy'
};

// 🔧 ENCABEZADO WAV (Para que suene en Android)
function createWavHeader(dataLength) {
    const sampleRate = 24000;
    const buffer = Buffer.alloc(44);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataLength, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); 
    buffer.writeUInt16LE(1, 20); 
    buffer.writeUInt16LE(1, 22); 
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32); 
    buffer.writeUInt16LE(16, 34); 
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataLength, 40);
    return buffer;
}

wss.on('connection', (ws) => {
    console.log(`⚡ Cliente Conectado`);
    let openAiWs = null;

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            // ==========================
            // 🔴 MODO LIVE (REALTIME)
            // ==========================
            if (data.type === 'start_realtime_session') {
                console.log("🎙️ Iniciando Live...");
                
                openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
                    headers: {
                        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                        'OpenAI-Beta': 'realtime=v1'
                    }
                });

                const lang1 = data.config?.lang1 || "es";
                const lang2 = data.config?.lang2 || "en";

                openAiWs.on('open', () => {
                    console.log("✅ Conectado a OpenAI Live");
                    
                    // 🔥 INSTRUCCIONES BIDIRECCIONALES ESTRICTAS
                    const instructions = `
                        You are a BIDIRECTIONAL INTERPRETER.
                        Languages: ${lang1} AND ${lang2}.
                        
                        RULES:
                        1. If you hear ${lang1}, translate it immediately to ${lang2}.
                        2. If you hear ${lang2}, translate it immediately to ${lang1}.
                        3. DO NOT answer questions. If the user asks "How are you?", translate the question. Do not reply.
                        4. DO NOT explain anything. Just translate content.
                        5. Keep translations concise.
                    `;

                    const sessionConfig = {
                        type: "session.update",
                        session: {
                            modalities: ["text", "audio"],
                            instructions: instructions,
                            voice: "alloy",
                            input_audio_format: "pcm16",
                            output_audio_format: "pcm16",
                            turn_detection: { type: "server_vad", threshold: 0.5 }
                        }
                    };
                    openAiWs.send(JSON.stringify(sessionConfig));
                });

                openAiWs.on('message', (openaiMsg) => {
                    const response = JSON.parse(openaiMsg);
                    
                    if (response.type === 'response.audio.delta' && response.delta) {
                        const pcmBuffer = Buffer.from(response.delta, 'base64');
                        const header = createWavHeader(pcmBuffer.length);
                        const wavBuffer = Buffer.concat([header, pcmBuffer]);

                        ws.send(JSON.stringify({ 
                            type: 'audio_stream', 
                            audio: wavBuffer.toString('base64') 
                        }));
                    }
                    
                    if (response.type === 'input_audio_buffer.speech_started') {
                        ws.send(JSON.stringify({ type: 'vad_start' }));
                        openAiWs.send(JSON.stringify({ type: 'response.cancel' }));
                    }
                });
            }

            // RECIBIR AUDIO LIVE (M4A -> PCM)
            else if (data.type === 'audio_input' && openAiWs && openAiWs.readyState === WebSocket.OPEN) {
                const inputBuffer = Buffer.from(data.payload, 'base64');
                const tempIn = path.join(tempDir, `live_${Date.now()}_${Math.random()}.m4a`);
                const tempOut = path.join(tempDir, `live_${Date.now()}_${Math.random()}.raw`);

                try {
                    fs.writeFileSync(tempIn, inputBuffer);
                    
                    ffmpeg(tempIn)
                        .audioFrequency(24000)
                        .audioChannels(1)
                        .audioCodec('pcm_s16le')
                        .format('s16le')
                        .save(tempOut)
                        .on('end', () => {
                            if (fs.existsSync(tempOut)) {
                                const pcmData = fs.readFileSync(tempOut);
                                openAiWs.send(JSON.stringify({
                                    type: "input_audio_buffer.append",
                                    audio: pcmData.toString('base64')
                                }));
                                try { fs.unlinkSync(tempIn); fs.unlinkSync(tempOut); } catch(e){}
                            }
                        })
                        .on('error', (err) => {
                            console.error("FFMPEG Live Error:", err);
                            try { fs.unlinkSync(tempIn); } catch(e){}
                        });
                } catch (e) { console.error("FS Error:", e); }
            }

            else if (data.type === 'end_realtime_session') {
                if (openAiWs) openAiWs.close();
            }

            // ==========================
            // 🔵 MODO CLÁSICO (CHAT)
            // ==========================
            else if (['audio_input', 'text_input'].includes(data.type) && !openAiWs) {
                await handleClassicRequest(ws, data);
            }

        } catch (e) { console.error("Error:", e.message); }
    });

    ws.on('close', () => { if (openAiWs) openAiWs.close(); });
});

// LÓGICA CHAT CLÁSICO (USANDO LA LISTA COMPLETA DE IDIOMAS)
async function handleClassicRequest(ws, data) {
    try {
        let userText = "";
        
        // 1. Audio a Texto
        if (data.type === 'audio_input') {
            const inputPath = path.join(tempDir, `chat_${Date.now()}.m4a`);
            fs.writeFileSync(inputPath, Buffer.from(data.payload, 'base64'));
            
            // Busca el código de idioma en la lista completa
            const langCode = data.my_lang ? (ISO_LANGS[data.my_lang.split(' ')[0]] || undefined) : undefined;
            
            const transcription = await openai.audio.transcriptions.create({ 
                file: fs.createReadStream(inputPath), model: "whisper-1", language: langCode 
            });
            try { fs.unlinkSync(inputPath); } catch(e){}
            userText = transcription.text;
        } else {
            userText = data.text;
        }

        const cleanText = userText ? userText.trim() : "";
        if (cleanText.length < 1 || HALLUCINATIONS.some(h => cleanText.toLowerCase().includes(h.toLowerCase()))) return;

        // 2. Traducción Estricta (Modo Chat)
        const completion = await openai.chat.completions.create({
            messages: [
                { 
                    role: "system", 
                    content: `You are a professional translator. Translate the text from ${data.my_lang} to ${data.language}. Only return the translation.` 
                }, 
                { role: "user", content: cleanText }
            ],
            model: "gpt-4o", 
            max_tokens: 300
        });
        
        const aiText = completion.choices[0].message.content;

        // 3. Audio de Respuesta
        const mp3 = await openai.audio.speech.create({ 
            model: "tts-1", voice: data.voice || "alloy", input: aiText, speed: 1.1 
        });
        const buffer = Buffer.from(await mp3.arrayBuffer());
        
        ws.send(JSON.stringify({ 
            type: 'full_response', user_text: cleanText, ai_text: aiText, audio_payload: buffer.toString('base64') 
        }));

    } catch (e) { console.error("Error Chat:", e); }
}