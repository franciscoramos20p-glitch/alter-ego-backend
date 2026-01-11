import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

dotenv.config();

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log(`🚀 SERVIDOR v3.9.8 (Inteligente + Económico): Listo en puerto ${PORT}`);

const tempDir = path.resolve('temp_audio');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// 🚫 LISTA NEGRA DE ALUCINACIONES (Si la IA dice esto, la callamos)
const BLACKLIST = [
    "Amara.org", "Subtitle", "Subtítulos", "albertoplasencia", "MBC", "SBS",
    "Thanks for watching", "Gracias por ver", "suscríbete", "subscribe",
    "copyright", "All rights reserved", "©", "Inglés y Coreano",
    "Spanish, Spanish", "Español, Español", "English, English"
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
    console.log('⚡ Cliente conectado');

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            
            // Si el tono no viene, ponemos Neutral por defecto
            const tone = data.tone || "Neutral"; 
            
            // === ⌨️ MODO TEXTO (ECONÓMICO: GPT-4o-mini) ===
            if (data.type === 'text_input') {
                console.log(`📝 Texto recibido: "${data.text}"`);
                // Usamos el modelo "mini" que es mucho más barato para texto simple
                await processGPT(ws, data.text, data.my_lang, data.language, tone, data.voice, "interpreter", "gpt-4o-mini");
            }

            // === 🎤 MODO AUDIO (POTENTE: GPT-4o) ===
            if (data.type === 'audio_input') {
                const inputPath = path.join(tempDir, `input_${Date.now()}.m4a`);
                fs.writeFileSync(inputPath, Buffer.from(data.payload, 'base64'));

                const langCode = ISO_LANGS[(data.my_lang || "").split(' ')[0]] || undefined;

                // Transcribir audio
                const transcription = await openai.audio.transcriptions.create({ 
                    file: fs.createReadStream(inputPath), 
                    model: "whisper-1",
                    prompt: `Conversation in ${data.my_lang} and ${data.language}.`, 
                    temperature: 0, 
                    language: langCode 
                });

                const userText = transcription.text;
                fs.unlinkSync(inputPath); 

                // --- FILTROS DE SEGURIDAD ---
                if (!userText || userText.trim().length < 2) return; // Ignorar ruidos cortos
                // Ignorar alucinaciones conocidas
                if (BLACKLIST.some(bad => userText.toLowerCase().includes(bad.toLowerCase()))) {
                    console.log(`👻 Alucinación bloqueada: ${userText}`);
                    return; 
                }

                console.log(`👂 Audio oído: "${userText}"`);
                
                // Usamos el modelo "gpt-4o" (el potente) para entender bien la voz y el contexto
                await processGPT(ws, userText, data.my_lang, data.language, tone, data.voice, "interpreter", "gpt-4o");
            }

            // === 👁️ CÁMARA (POTENTE) ===
            if (data.type === 'image_input') {
                const response = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [
                        { role: "user", content: [ 
                            { type: "text", text: `Traduce el texto de la imagen al ${data.my_lang}. Tono: ${tone}.`}, 
                            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${data.payload}`, detail: "auto" } }
                        ]}
                    ],
                    max_tokens: 300, 
                });
                sendResponse(ws, "📸 Imagen", response.choices[0].message.content, tone, data.voice);
            }

        } catch (error) { console.error("Error General:", error.message); }
    });
});

async function processGPT(ws, userText, myLang, targetLang, tone, voice, mode, modelName) {
    try {
        // Prompt diseñado para NO repetir el idioma
        const systemPrompt = `Eres un intérprete experto. 
        Tono: ${tone}.
        Instrucciones:
        1. Si recibes ${myLang}, traduce al ${targetLang}.
        2. Si recibes ${targetLang}, traduce al ${myLang}.
        3. NO expliques nada. Solo da la traducción.
        4. NO repitas el nombre del idioma (ej: No digas "Spanish: ...").
        5. Si la entrada no tiene sentido, no respondas nada.`;

        const completion = await openai.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userText }
            ],
            model: modelName, 
            temperature: 0.3,
            max_tokens: 200, 
        });

        let aiText = completion.choices[0].message.content;

        // Filtro final: Si la IA repite "Spanish Spanish", lo borramos
        if (aiText.includes("Spanish") && aiText.length < 20) return;
        
        sendResponse(ws, userText, aiText, tone, voice);

    } catch (e) { console.error("Error GPT:", e.message); }
}

async function sendResponse(ws, userText, aiText, tone, voice = 'alloy') {
    try {
        const mp3 = await openai.audio.speech.create({ 
            model: "tts-1", voice: voice, input: aiText, speed: 1.1 
        });
        const audioBuffer = Buffer.from(await mp3.arrayBuffer());
        
        ws.send(JSON.stringify({ 
            type: 'full_response', 
            user_text: userText, // Enviamos lo que dijo el usuario para mostrarlo
            ai_text: aiText, 
            tone: tone, 
            audio_payload: audioBuffer.toString('base64') 
        }));
    } catch (e) { console.error("Error Audio:", e.message); }
}