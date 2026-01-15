import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

dotenv.config();

// CONFIGURACIÓN
ffmpeg.setFfmpegPath(ffmpegPath);
const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const tempDir = path.resolve(process.platform === 'win32' ? './temp_audio' : '/tmp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

console.log(`🚀 SERVIDOR ALTER EGO PRO V5.0 - PUERTO ${PORT}`);

// 🛡️ LISTA NEGRA DE ALUCINACIONES (Si detecta esto, aborta)
const HALLUCINATIONS = [
    "Subtitles by", "Amara.org", "Community", "music playing", 
    "Unresearched", "Thank you", "Suscríbete", "Copyright", 
    "Translated by", "MBC", "SBS", "provided by", "watching",
    "Please subscribe", "Me gusta", "blue skies", "sous-titres",
    "Silence", "Ruido", "Noise", "www.", ".com", "Sucedió",
    "subtítulos", "captioned", "Audio", "Transcribe", 
    "música", "aplausos", "risa", "locutor", "voz en off"
];

wss.on('connection', (ws) => {
    console.log(`⚡ Cliente Conectado: ${ws._socket.remoteAddress}`);
    let openAiWs = null;

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            // =====================================
            // A. MODO ULTRA LIVE (REALTIME API)
            // =====================================
            if (data.type === 'start_realtime_session') {
                console.log("🎙️ Iniciando Sesión LIVE (Realtime API)");
                
                // Conectamos tu servidor a OpenAI
                openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
                    headers: {
                        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                        'OpenAI-Beta': 'realtime=v1'
                    }
                });

                const lang1 = data.config?.lang1 || "Español";
                const lang2 = data.config?.lang2 || "Inglés";

                openAiWs.on('open', () => {
                    // INSTRUCCIÓN MAESTRA: ACTUAR COMO INTÉRPRETE INVISIBLE
                    const sessionConfig = {
                        type: "session.update",
                        session: {
                            modalities: ["text", "audio"],
                            instructions: `Eres AlterEgo, un intérprete profesional bilingüe (${lang1} <-> ${lang2}). 
                            1. Escucha el audio. 
                            2. Si es ${lang1}, traduce INMEDIATAMENTE al ${lang2}.
                            3. Si es ${lang2}, traduce INMEDIATAMENTE al ${lang1}.
                            4. REGLA DE ORO: Si escuchas ruido, silencio o respiración, NO DIGAS NADA. NO traduzcas "silencio" ni inventes frases.
                            5. Mantén el tono y la emoción original.`,
                            voice: "alloy",
                            input_audio_format: "pcm16",
                            output_audio_format: "pcm16",
                            turn_detection: { type: "server_vad" } // VAD: Detección de Voz Automática (sin botones)
                        }
                    };
                    openAiWs.send(JSON.stringify(sessionConfig));
                });

                // Cuando OpenAI responde (Audio del traductor)
                openAiWs.on('message', (openaiMsg) => {
                    const response = JSON.parse(openaiMsg);
                    // Si recibimos audio delta (chunks)
                    if (response.type === 'response.audio.delta') {
                        // Reenviamos tal cual al cliente (el cliente reproducirá el PCM/Base64)
                        ws.send(JSON.stringify({ 
                            type: 'audio_stream', 
                            payload: response.delta 
                        }));
                    }
                });
                
                openAiWs.on('error', (e) => console.error("Error OpenAI WS:", e));
            }

            // RECIBIR AUDIO DEL CLIENTE (CHUNKS)
            else if (data.type === 'audio_chunk' && openAiWs && openAiWs.readyState === WebSocket.OPEN) {
                // El cliente manda base64, OpenAI quiere base64 PCM16.
                // Asumimos que el cliente ya envía el formato correcto o lo convertimos aquí.
                // Para latencia ultra-baja, lo ideal es enviar PCM raw.
                openAiWs.send(JSON.stringify({
                    type: "input_audio_buffer.append",
                    audio: data.payload
                }));
            }

            else if (data.type === 'end_realtime_session') {
                if (openAiWs) openAiWs.close();
                console.log("🛑 Sesión Live Finalizada");
            }

            // =====================================
            // B. MODO CLÁSICO (GPT-4o + WHISPER)
            // =====================================
            else if (['audio_input', 'text_input'].includes(data.type)) {
                handleClassicRequest(ws, data);
            }

        } catch (e) { console.error("Error General:", e.message); }
    });

    ws.on('close', () => {
        if (openAiWs) openAiWs.close();
        console.log("Client disconnected");
    });
});

// PROCESADOR MODO CLÁSICO
async function handleClassicRequest(ws, data) {
    try {
        let userText = "";
        
        // 1. Si es audio, transcribir con Whisper
        if (data.type === 'audio_input') {
            const inputPath = path.join(tempDir, `classic_${Date.now()}.m4a`);
            fs.writeFileSync(inputPath, Buffer.from(data.payload, 'base64'));
            
            const transcription = await openai.audio.transcriptions.create({ 
                file: fs.createReadStream(inputPath), 
                model: "whisper-1",
                language: ISO_LANGS[data.my_lang] || undefined, // Ayuda a Whisper pero no fuerza si no existe
                prompt: "Focus on spoken words, ignore background noise."
            });
            fs.unlinkSync(inputPath);
            userText = transcription.text;
        } else {
            userText = data.text;
        }

        // 2. Filtro Anti-Basura
        if (HALLUCINATIONS.some(h => userText.toLowerCase().includes(h.toLowerCase())) || userText.length < 2) {
            console.log("🗑️ Basura filtrada:", userText);
            return; // No cobramos, no respondemos
        }

        // 3. Traducción Inteligente GPT-4o
        const completion = await openai.chat.completions.create({
            messages: [
                { role: "system", content: `Actúa como traductor.
                  Idioma A: ${data.my_lang}. Idioma B: ${data.language}.
                  Detecta el idioma de: "${userText}".
                  Si es A -> Traduce a B.
                  Si es B -> Traduce a A.
                  Solo devuelve el texto traducido. Nada más.` }, 
                { role: "user", content: userText }
            ],
            model: "gpt-4o",
            max_tokens: 200
        });
        
        const aiText = completion.choices[0].message.content;

        // 4. Generar Audio TTS
        const mp3 = await openai.audio.speech.create({ 
            model: "tts-1", voice: data.voice, input: aiText, speed: 1.1 
        });
        const buffer = Buffer.from(await mp3.arrayBuffer());
        
        // Enviar respuesta
        ws.send(JSON.stringify({ 
            type: 'full_response', 
            user_text: userText, 
            ai_text: aiText, 
            audio_payload: buffer.toString('base64')
        }));

    } catch (e) { console.error("Error Classic:", e); }
}

const ISO_LANGS = { 'Español': 'es', 'Inglés': 'en', 'Francés': 'fr' }; // Añadir el resto si quieres optimizar Whisper