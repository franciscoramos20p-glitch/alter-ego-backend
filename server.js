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

console.log(`🚀 SERVIDOR V4.6 (FIXED LIVE + BIDIRECTIONAL): Puerto ${PORT}`);

const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// 🛡️ LISTA NEGRA EXTENDIDA (CERO BASURA)
const HALLUCINATIONS = [
    "Subtitles by", "Amara.org", "Community", "music playing", 
    "Unresearched", "Thank you", "Suscríbete", "Copyright", 
    "Translated by", "MBC", "SBS", "provided by", "watching",
    "Please subscribe", "Me gusta", "blue skies", "sous-titres",
    "Silence", "Ruido", "Noise", "www.", ".com", "Sucedió",
    "subtítulos", "captioned", "Audio", "Transcribe"
];

// 🗺️ MAPA DE IDIOMAS (Para Whisper)
const ISO_LANGS = {
    'Español': 'es', 'Inglés': 'en', 'Francés': 'fr', 'Alemán': 'de', 'Italiano': 'it', 
    'Portugués': 'pt', 'Chino': 'zh', 'Japonés': 'ja', 'Coreano': 'ko', 'Ruso': 'ru', 
    'Árabe': 'ar', 'Hindi': 'hi' // (Resumido para brevedad, funcionan todos)
};

wss.on('connection', (ws) => {
    console.log(`⚡ Cliente Conectado`);
    let openAiWs = null;

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            // =====================================
            // A. MODO ULTRA LIVE (REALTIME API)
            // =====================================
            if (data.type === 'start_realtime_session') {
                console.log("🎙️ Iniciando Live...");
                
                openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
                    headers: {
                        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                        'OpenAI-Beta': 'realtime=v1'
                    }
                });

                const lang1 = data.config.lang1 || "Español";
                const lang2 = data.config.lang2 || "Inglés";
                const tone = data.config.tone || "Neutral";

                openAiWs.on('open', () => {
                    // INSTRUCCIÓN MAESTRA: NO ALUCINAR
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
                            type: 'audio_payload', 
                            audio_payload: wavBuffer.toString('base64') 
                        }));
                    }
                });
                
                openAiWs.on('error', (e) => console.error("Error OpenAI:", e));
            }

            // RECEPCIÓN AUDIO LIVE (CONVERSOR)
            else if (data.type === 'audio_append' && openAiWs && openAiWs.readyState === WebSocket.OPEN) {
                const inputBuffer = Buffer.from(data.audio, 'base64');
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
            }

            // =====================================
            // B. MODO CLÁSICO (SOLUCIÓN AL ECO)
            // =====================================
            else if (['audio_input', 'text_input', 'image_input'].includes(data.type)) {
                handleClassicRequest(ws, data);
            }

        } catch (e) { console.error("Error:", e.message); }
    });
});

// 🛠️ CONVERSOR ROBUSTO (M4A -> PCM16)
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

function toWav(pcmData) {
    const dataSize = pcmData.length;
    const buffer = Buffer.alloc(44 + dataSize);
    buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + dataSize, 4); buffer.write('WAVE', 8); buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(24000, 24);
    buffer.writeUInt32LE(48000, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40); pcmData.copy(buffer, 44);
    return buffer;
}

// LÓGICA CLÁSICA CORREGIDA (AUTO-IDIOMA)
async function handleClassicRequest(ws, data) {
    let calculatedCost = 0; 
    try {
        const tone = data.tone || "Neutral"; 
        // Aunque la App diga que hablas Español, usaremos detección automática real.
        
        if (data.type === 'audio_input') {
            const inputPath = path.join(tempDir, `classic_${Date.now()}.m4a`);
            fs.writeFileSync(inputPath, Buffer.from(data.payload, 'base64'));
            
            // Usamos Whisper SIN forzar idioma para que detecte lo que realmente hablaste
            const transcription = await openai.audio.transcriptions.create({ 
                file: fs.createReadStream(inputPath), 
                model: "whisper-1",
                prompt: "Translation task. Ignore subtitles."
            });
            fs.unlinkSync(inputPath);
            const text = transcription.text;

            // Filtro Anti-Basura
            if (HALLUCINATIONS.some(h => text.toLowerCase().includes(h.toLowerCase())) || text.length < 2) return;

            calculatedCost += (text.length * 0.001); 
            // AQUÍ ESTÁ LA CORRECCIÓN DEL ECO:
            await processGPT(ws, text, data.my_lang, data.language, tone, data.voice, calculatedCost);
        } 
        
        else if (data.type === 'text_input') {
            await processGPT(ws, data.text, data.my_lang, data.language, tone, data.voice, 0.02);
        }

        // ... imagen igual ...
    } catch (e) { console.error(e); }
}

async function processGPT(ws, text, lang1, lang2, tone, voice, cost) {
    try {
        // PROMPT BIDIRECCIONAL INTELIGENTE
        const completion = await openai.chat.completions.create({
            messages: [
                { role: "system", content: `Eres un traductor experto. 
                  Tienes dos idiomas: ${lang1} y ${lang2}.
                  1. Detecta en qué idioma está el texto del usuario: "${text}".
                  2. Si está en ${lang1}, tradúcelo al ${lang2}.
                  3. Si está en ${lang2}, tradúcelo al ${lang1}.
                  4. Tono: ${tone}.
                  5. SOLO dame la traducción.` }, 
                { role: "user", content: text }
            ],
            model: "gpt-4o", 
            max_tokens: 300
        });
        
        const aiText = completion.choices[0].message.content;
        const finalCost = cost + (aiText.length * 0.002); 

        // TTS
        const mp3 = await openai.audio.speech.create({ 
            model: "tts-1", voice: voice, input: aiText, speed: 1.1 
        });
        const buffer = Buffer.from(await mp3.arrayBuffer());
        
        ws.send(JSON.stringify({ 
            type: 'full_response', 
            user_text: text, 
            ai_text: aiText, 
            tone: tone, 
            audio_payload: buffer.toString('base64'),
            calculated_cost: finalCost
        }));
    } catch (e) { console.error(e); }
}