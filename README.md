# Telegram Ma'lumotlarni Excel'ga Yozuvchi Bot

Bu bot foydalanuvchilardan ism, familiya va telefon raqamini so'raydi va ma'lumotlarni Excel fayliga saqlaydi.

## Imkoniyatlar

- Foydalanuvchilardan ism, familiya va telefon raqamini so'raydi
- Ma'lumotlarni Excel fayliga saqlaydi
- Barcha ma'lumotlarni Excel fayli ko'rinishida yuboradi

## Buyruqlar

- `/start` - Bot haqida ma'lumot
- `/register` - Ro'yxatdan o'tishni boshlash
- `/status` - Joriy holatni tekshirish
- `/getexcel` - Excel faylini olish

## O'rnatish

1. BotFather orqali Telegram bot yarating va tokenni oling
2. Bot tokenini quyidagi ko'rinishda muhit o'zgaruvchisi sifatida o'rnating:
   \`\`\`
   export TELEGRAM_BOT_TOKEN=your_token_here
   \`\`\`
3. Kerakli paketlarni o'rnating:
   \`\`\`
   npm install
   \`\`\`
4. Botni ishga tushiring:
   \`\`\`
   npm start
   \`\`\`

## Qanday foydalanish

1. Bot bilan suhbatni boshlang
2. `/register` buyrug'ini yuboring
3. Bot so'ragan ma'lumotlarni (ism, familiya, telefon raqam) kiriting
4. Ma'lumotlar avtomatik ravishda Excel fayliga saqlanadi
5. Barcha ma'lumotlarni ko'rish uchun `/getexcel` buyrug'ini yuboring

## Talablar

- Node.js 14+
- npm yoki yarn

