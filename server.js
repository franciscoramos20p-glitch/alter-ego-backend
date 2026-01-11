import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 CEREBRO VELOZ (v3.9 - GLOBAL PRO): Listo en puerto ${PORT}`);

const tempDir = path.resolve('temp_audio');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// 🚫 LISTA NEGRA DE ALUCINACIONES (Anti-Fantasmas)
const HALLUCINATION_BLACKLIST = [
    "Amara.org", "Subtitle", "Subtítulos", "albertoplasencia", 
    "Thanks for watching", "Gracias por ver", "suscríbete", "subscribe",
    "like and subscribe", "dale like", "comment below", "moo", 
    "MBC", "SBS", "copyright", "All rights reserved", "©",
    "Inglés and Korean", "Spanish and Korean"
];

//# 🗺️ MAPA DE IDIOMAS GIGANTE (Soporte para los 50 idiomas de la v3.9)
const ISO_LANGS = {
    'Español': 'es', 'Inglés': 'en', 'Japonés': 'ja', 'Coreano': 'ko',
    'Francés': 'fr', 'Alemán': 'de', 'Italiano': 'it', 'Portugués': 'pt', 
    'Chino': 'zh', 'Ruso': 'ru', 'Árabe': 'ar', 'Hindi': 'hi',
    'Holandés': 'nl', 'Turco': 'tr', 'Polaco': 'pl', 'Sueco': 'sv',
    'Griego': 'el', 'Hebreo': 'he', 'Tailandés': 'th', 'Vietnamita': 'vi',
    'Indonesio': 'id', 'Checo': 'cs', 'Danés': 'da', 'Finlandés': 'fi',
    'Húngaro': 'hu', 'Noruego': 'no', 'Rumano': 'ro', 'Ucraniano': 'uk',
    'Tagalo': 'tl', 'Malayo': 'ms', 'Búlgaro': 'bg', 'Croata': 'hr',
    'Eslovaco': 'sk', 'Estonio': 'et', 'Catalán': 'ca', 'Serbio': 'sr',
    'Lituano': 'lt', 'Esloveno': 'sl', 'Letón': 'lv', 'Persa': 'fa',
    'Urdu': 'ur', 'Bengalí': 'bn'
};

wss.on('connection', (ws) => {
    console.log('⚡ Cliente v3.9 conectado');

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            
            const myLang = data.my_lang || "Español";
            const targetLang = data.language || "Inglés";
            const chosenTone = data.tone || "Neutral"; // Aquí viene inyectado el contexto también
            const chosenVoice = data.voice || "alloy";
            const mode = data.mode || "interpreter"; 

            // === ⌨️ TEXT INPUT (NUEVO v3.9) ===
            if (data.type === 'text_input') {
                const userText = data.text;
                console.log(`📝 Texto recibido: "${userText}"`);

                // Usamos la misma lógica de cerebro que el audio
                await processGPTAndRespond(ws, userText, myLang, targetLang, chosenTone, chosenVoice, mode);
            }

            // === 🎤 AUDIO INPUT (CLÁSICO) ===
            if (data.type === 'audio_input') {
                const inputPath = path.join(tempDir, `input_${Date.now()}.m4a`);
                fs.writeFileSync(inputPath, Buffer.from(data.payload, 'base64'));

                // Detectar código de idioma para ayudar a Whisper
                const langCode = ISO_LANGS[myLang.split(' ')[0]] || undefined;

                // 1. TRANSCRIPCIÓN (WHISPER)
                const transcription = await openai.audio.transcriptions.create({ 
                    file: fs.createReadStream(inputPath), 
                    model: "whisper-1",
                    prompt: `Conversation in ${myLang}, ${targetLang}.`, 
                    temperature: 0, 
                    language: langCode 
                });

                const userText = transcription.text;
                fs.unlinkSync(inputPath); // Borrar archivo rápido

                // 🛡️ FILTRO RÁPIDO ANTI-BASURA
                if (!userText || userText.trim().length < 2) return;
                const isGhost = HALLUCINATION_BLACKLIST.some(phrase => userText.toLowerCase().includes(phrase.toLowerCase()));
                if (isGhost) {
                    console.log(`👻 Ignorando fantasma: "${userText}"`);
                    return; 
                }

                console.log(`👂 Oído: "${userText}"`);

                // Procesar con GPT
                await processGPTAndRespond(ws, userText, myLang, targetLang, chosenTone, chosenVoice, mode);
            }

            // === 👁️ VISIÓN (CÁMARA) ===
            if (data.type === 'image_input') {
                console.log("📸 Procesando imagen...");
                const response = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [
                        { role: "user", content: [ 
                            { type: "text", text: `Analiza esta imagen. Si hay texto, tradúcelo al ${myLang}. Si es un objeto, descríbelo. Tono/Contexto: ${chosenTone}.`}, 
                            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.payload}`, detail: "auto" } }
                        ]}
                    ],
                    max_tokens: 300, 
                });
                const aiText = response.choices[0].message.content;
                sendResponse(ws, "📸 Imagen analizada", aiText, chosenTone, chosenVoice);
            }

        } catch (error) { console.error("Error General:", error.message); }
    });
});

// --- FUNCIÓN CENTRAL DEL CEREBRO (GPT-4o) ---
async function processGPTAndRespond(ws, userText, myLang, targetLang, chosenTone, chosenVoice, mode) {
    
    // Prompt mejorado para v3.9 (Contexto Profesional)
    let systemPrompt = "";
    if (mode === 'interpreter') {
        systemPrompt = `Eres AlterEgo, un intérprete experto y profesional.
        Idiomas: ${myLang} <-> ${targetLang}.
        
        INSTRUCCIONES CLAVE:
        1. Escucha el idioma de entrada y traduce al otro automáticamente.
        2. CONTEXTO Y TONO: "${chosenTone}". (Si dice 'Soy Médico' o 'Abogado', usa vocabulario técnico preciso).
        3. Sé directo. No digas "Aquí tienes la traducción". Solo traduce.
        4. Si el usuario habla en ${myLang}, responde en ${targetLang}.
        5. Si el usuario habla en ${targetLang}, responde en ${myLang}.`;
    } else {
        systemPrompt = `Eres un traductor personal. Traduce todo lo que recibas al ${myLang}.
        Configuración: ${chosenTone}.`;
    }

    try {
        const completion = await openai.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userText }
            ],
            model: "gpt-4o",
            temperature: 0.3,
            max_tokens: 250, 
        });

        const aiText = completion.choices[0].message.content;
        
        // Evitar respuestas vacías o bloqueos
        if (!aiText || aiText.includes("I cannot translate")) return;

        // Enviar audio y texto de vuelta
        sendResponse(ws, userText, aiText, chosenTone, chosenVoice);

    } catch (e) {
        console.error("Error GPT:", e.message);
    }
}

async function sendResponse(ws, userText, aiText, tone, voice = 'alloy') {
    try {
        // Usamos tts-1 para máxima velocidad (Flash Mode)
        const mp3 = await openai.audio.speech.create({ 
            model: "tts-1", 
            voice: voice, 
            input: aiText, 
            speed: 1.1 
        });
        
        const audioBuffer = Buffer.from(await mp3.arrayBuffer());
        
        ws.send(JSON.stringify({ 
            type: 'full_response', 
            user_text: userText, 
            ai_text: aiText, 
            tone: tone, 
            audio_payload: audioBuffer.toString('base64') 
        }));
    } catch (e) {
        console.error("Error TTS:", e.message);
    }
}