import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

dotenv.config();

// ✅ CONFIGURACIÓN BLINDADA
ffmpeg.setFfmpegPath(ffmpegPath);

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 SERVIDOR V5.0 (CLASSIC MAX + REALTIME LIVE): Puerto ${PORT}`);

const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// 🛡️ LISTA NEGRA DE ALUCINACIONES (CERO BASURA)
const HALLUCINATIONS = [
    "Subtitles by", "Amara.org", "Community", "music playing", 
    "Unresearched", "Thank you", "Suscríbete", "Copyright", 
    "Translated by", "MBC", "SBS", "provided by", "watching",
    "Please subscribe", "Me gusta", "blue skies", "sous-titres",
    "Silence", "Ruido", "Noise", "www.", ".com", "Sucedió",
    "subtítulos", "captioned", "Audio", "Transcribe", 
    "música", "aplausos", "risa", "locutor", "voz en off"
];

// 🗺️ MAPA DE 50 IDIOMAS (Para Whisper Clásico)
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

wss.on('connection', (ws) => {
    console.log(`⚡ Cliente Conectado: ${ws._socket.remoteAddress}`);
    let openAiWs = null;

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            // =====================================
            // A. MODO ULTRA LIVE (REALTIME API - PAGADO)
            // =====================================
            if (data.type === 'start_realtime_session') {
                console.log("🎙️ Iniciando Live Realtime...");
                
                openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
                    headers: {
                        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                        'OpenAI-Beta': 'realtime=v1'
                    }
                });

                const lang1 = data.config?.lang1 || "Español";
                const lang2 = data.config?.lang2 || "Inglés";

                openAiWs.on('open', () => {
                    const sessionConfig = {
                        type: "session.update",
                        session: {
                            modalities: ["text", "audio"],
                            instructions: `Eres un intérprete de élite. 
                            Idiomas activos: ${lang1} y ${lang2}.
                            TU MISIÓN: Detecta automáticamente el idioma del audio. 
                            - Si es ${lang1}, traduce al ${lang2}.
                            - Si es ${lang2}, traduce al ${lang1}.
                            - Sé extremadamente breve y rápido.
                            - Si hay silencio o ruido: IGNORAR. NO HABLES.`,
                            voice: "alloy",
                            input_audio_format: "pcm16",
                            output_audio_format: "pcm16",
                            turn_detection: null 
                        }
                    };
                    openAiWs.send(JSON.stringify(sessionConfig));
                });

                openAiWs.on('message', (openaiMsg) => {
                    const response = JSON.parse(openaiMsg);
                    if (response.type === 'response.audio.delta') {
                        const pcmBuffer = Buffer.from(response.delta, 'base64');
                        const wavBuffer = toWav(pcmBuffer);
                        ws.send(JSON.stringify({ 
                            type: 'audio_stream', // Compatible con LiveScreen.js nuevo
                            audio: wavBuffer.toString('base64') 
                        }));
                    }
                });
                
                openAiWs.on('error', (e) => console.error("Error OpenAI:", e));
            }

            // RECEPCIÓN AUDIO LIVE (CONVERSOR)
            else if (data.type === 'audio_input' && openAiWs && openAiWs.readyState === WebSocket.OPEN) {
                // LiveScreen envía 'audio_input' con base64
                const inputBuffer = Buffer.from(data.payload, 'base64');
                convertM4AtoPCM(inputBuffer, (pcmBuffer) => {
                    openAiWs.send(JSON.stringify({
                        type: "input_audio_buffer.append",
                        audio: pcmBuffer.toString('base64')
                    }));
                    openAiWs.send(JSON.stringify({type: 'input_audio_buffer.commit'}));
                    openAiWs.send(JSON.stringify({type: 'response.create'}));
                });
            }

            else if (data.type === 'end_realtime_session') {
                if (openAiWs) openAiWs.close();
                console.log("🛑 Live Terminado");
            }

            // =====================================
            // B. MODO CLÁSICO (CHAT COMPLETO)
            // =====================================
            else if (['audio_input', 'text_input', 'image_input'].includes(data.type) && !openAiWs) {
                // Solo procesamos clásico si NO estamos en Live
                await handleClassicRequest(ws, data);
            }

        } catch (e) { console.error("Error General:", e.message); }
    });

    ws.on('close', () => {
        if (openAiWs) openAiWs.close();
    });
});

// 🛠️ CONVERSOR ROBUSTO (M4A -> PCM16 para Realtime)
function convertM4AtoPCM(inputBuffer, callback) {
    const tempIn = path.join(tempDir, `in_${Date.now()}_${Math.random()}.m4a`);
    const tempOut = path.join(tempDir, `out_${Date.now()}_${Math.random()}.raw`);

    try {
        fs.writeFileSync(tempIn, inputBuffer);
        ffmpeg(tempIn)
            .inputFormat('m4a')
            .audioFrequency(24000)
            .audioChannels(1)
            .audioCodec('pcm_s16le')
            .format('s16le')
            .save(tempOut)
            .on('end', () => {
                if (fs.existsSync(tempOut)) {
                    const pcmData = fs.readFileSync(tempOut);
                    callback(pcmData);
                    try { fs.unlinkSync(tempIn); fs.unlinkSync(tempOut); } catch(e){}
                }
            })
            .on('error', (err) => {
                console.error("FFmpeg Error:", err);
                try { if(fs.existsSync(tempIn)) fs.unlinkSync(tempIn); } catch(e){}
            });
    } catch(e) { console.error("File Error:", e); }
}

// Auxiliar WAV header para reproducción en App
function toWav(pcmData) {
    const dataSize = pcmData.length;
    const buffer = Buffer.alloc(44 + dataSize);
    buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + dataSize, 4); buffer.write('WAVE', 8); buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(24000, 24);
    buffer.writeUInt32LE(48000, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40); pcmData.copy(buffer, 44);
    return buffer;
}

// 🧠 CEREBRO MODO CLÁSICO (Whisper + GPT-4o)
async function handleClassicRequest(ws, data) {
    let calculatedCost = 0; 
    try {
        const tone = data.tone || "Neutral"; 
        let userText = "";
        
        // 1. Audio -> Texto (Whisper)
        if (data.type === 'audio_input') {
            const inputPath = path.join(tempDir, `classic_${Date.now()}.m4a`);
            fs.writeFileSync(inputPath, Buffer.from(data.payload, 'base64'));
            
            // Usamos Whisper con idioma opcional para mejorar precisión
            const langCode = ISO_LANGS[data.my_lang?.split(' ')[0]] || undefined;
            
            const transcription = await openai.audio.transcriptions.create({ 
                file: fs.createReadStream(inputPath), 
                model: "whisper-1",
                language: langCode, 
                prompt: "Focus on spoken words, ignore silence and background noise."
            });
            fs.unlinkSync(inputPath);
            userText = transcription.text;
            calculatedCost += (userText.length * 0.001); 
        } 
        else if (data.type === 'text_input') {
            userText = data.text;
            calculatedCost += 0.01;
        }

        // 2. Filtro Anti-Basura
        const cleanText = userText.trim();
        if (cleanText.length < 2 || HALLUCINATIONS.some(h => cleanText.toLowerCase().includes(h.toLowerCase()))) {
            console.log("🗑️ Basura filtrada:", cleanText);
            return; 
        }

        // 3. Traducción Inteligente (GPT-4o)
        const completion = await openai.chat.completions.create({
            messages: [
                { role: "system", content: `Eres un traductor experto. 
                  Tus idiomas activos son: ${data.my_lang} y ${data.language || data.target_lang_code}.
                  1. Detecta en qué idioma está: "${cleanText}".
                  2. Si es ${data.my_lang}, traduce al otro.
                  3. Si es el otro, traduce a ${data.my_lang}.
                  4. Tono: ${tone}.
                  5. SOLO devuelve la traducción.` }, 
                { role: "user", content: cleanText }
            ],
            model: "gpt-4o",
            max_tokens: 300
        });
        
        const aiText = completion.choices[0].message.content;
        calculatedCost += (aiText.length * 0.002); 

        // 4. TTS (Voz)
        const mp3 = await openai.audio.speech.create({ 
            model: "tts-1", voice: data.voice || "alloy", input: aiText, speed: 1.1 
        });
        const buffer = Buffer.from(await mp3.arrayBuffer());
        
        // 5. Respuesta Clásica
        ws.send(JSON.stringify({ 
            type: 'full_response', 
            user_text: cleanText, 
            ai_text: aiText, 
            audio_payload: buffer.toString('base64'),
            calculated_cost: calculatedCost
        }));

    } catch (e) { console.error("Error Classic:", e); }
}