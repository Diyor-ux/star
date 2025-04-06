import TelegramBot from "node-telegram-bot-api"
import ExcelJS from "exceljs"
import fs from "fs/promises"

// Replace with your bot token
const token = process.env.TELEGRAM_BOT_TOKEN

// Create a bot instance
const bot = new TelegramBot(token, { polling: true })

// Store user data collection state
const userSessions = {}

// User data collection states
const STATES = {
  IDLE: "idle",
  WAITING_FOR_NAME: "waiting_for_name",
  WAITING_FOR_SURNAME: "waiting_for_surname",
  WAITING_FOR_PHONE: "waiting_for_phone",
}

// Initialize the bot
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id
  bot.sendMessage(
    chatId,
    "Xush kelibsiz! Ma'lumotlarni yig'ish botiga.\n\n" +
      "Buyruqlar:\n" +
      "/register - Ro'yxatdan o'tishni boshlash\n" +
      "/status - Joriy holatni tekshirish",
  )
})

// Start registration process
bot.onText(/\/register/, (msg) => {
  const chatId = msg.chat.id
  const userId = msg.from.id

  userSessions[userId] = {
    state: STATES.WAITING_FOR_NAME,
    data: {
      name: "",
      surname: "",
      phone: "",
    },
  }

  bot.sendMessage(chatId, "Iltimos, ismingizni kiriting:")
})

// Check status
bot.onText(/\/status/, (msg) => {
  const chatId = msg.chat.id
  const userId = msg.from.id

  if (!userSessions[userId]) {
    return bot.sendMessage(chatId, "Siz hali ro'yxatdan o'tmadingiz. /register buyrug'ini yuboring.")
  }

  const state = userSessions[userId].state
  let statusMessage = "Joriy holat: "

  switch (state) {
    case STATES.IDLE:
      statusMessage += "Ro'yxatdan o'tish yakunlangan."
      break
    case STATES.WAITING_FOR_NAME:
      statusMessage += "Ism kiritilishi kutilmoqda."
      break
    case STATES.WAITING_FOR_SURNAME:
      statusMessage += "Familiya kiritilishi kutilmoqda."
      break
    case STATES.WAITING_FOR_PHONE:
      statusMessage += "Telefon raqam kiritilishi kutilmoqda."
      break
  }

  bot.sendMessage(chatId, statusMessage)
})

// Handle regular messages (data collection)
bot.on("message", async (msg) => {
  if (msg.text && !msg.text.startsWith("/")) {
    const userId = msg.from.id
    const chatId = msg.chat.id

    if (!userSessions[userId]) {
      return bot.sendMessage(chatId, "Ro'yxatdan o'tishni boshlash uchun /register buyrug'ini yuboring.")
    }

    const session = userSessions[userId]

    switch (session.state) {
      case STATES.WAITING_FOR_NAME:
        session.data.name = msg.text
        session.state = STATES.WAITING_FOR_SURNAME
        bot.sendMessage(chatId, "Rahmat! Endi familiyangizni kiriting:")
        break

      case STATES.WAITING_FOR_SURNAME:
        session.data.surname = msg.text
        session.state = STATES.WAITING_FOR_PHONE
        bot.sendMessage(chatId, "Rahmat! Endi telefon raqamingizni kiriting:")
        break

      case STATES.WAITING_FOR_PHONE:
        session.data.phone = msg.text
        session.state = STATES.IDLE

        // Save data to Excel
        try {
          await saveToExcel(userId, session.data)
          bot.sendMessage(
            chatId,
            "Rahmat! Ma'lumotlaringiz muvaffaqiyatli saqlandi.\n\n" +
              "Yangi ma'lumot kiritish uchun /register buyrug'ini yuboring.",
          )
        } catch (error) {
          console.error("Error saving to Excel:", error)
          bot.sendMessage(
            chatId,
            "Kechirasiz, ma'lumotlarni saqlashda xatolik yuz berdi. Iltimos, qayta urinib ko'ring.",
          )
        }
        break
    }
  }
})

// Function to save data to Excel
async function saveToExcel(userId, userData) {
  const excelFilePath = "users_data.xlsx"
  let workbook
  let worksheet

  try {
    // Check if file exists
    try {
      await fs.access(excelFilePath)
      // If file exists, read it
      workbook = new ExcelJS.Workbook()
      await workbook.xlsx.readFile(excelFilePath)
      worksheet = workbook.getWorksheet("Foydalanuvchilar")
    } catch (error) {
      // If file doesn't exist, create a new one
      workbook = new ExcelJS.Workbook()
      worksheet = workbook.addWorksheet("Foydalanuvchilar")

      // Add headers
      worksheet.columns = [
        { header: "ID", key: "id" },
        { header: "Ism", key: "name" },
        { header: "Familiya", key: "surname" },
        { header: "Telefon", key: "phone" },
        { header: "Sana", key: "date" },
      ]

      // Format columns
      worksheet.getColumn("A").width = 15
      worksheet.getColumn("B").width = 20
      worksheet.getColumn("C").width = 20
      worksheet.getColumn("D").width = 20
      worksheet.getColumn("E").width = 20
    }

    // Add the new row
    worksheet.addRow({
      id: userId,
      name: userData.name,
      surname: userData.surname,
      phone: userData.phone,
      date: new Date().toISOString(),
    })

    // Save the workbook
    await workbook.xlsx.writeFile(excelFilePath)

    return true
  } catch (error) {
    console.error("Error in saveToExcel:", error)
    throw error
  }
}

// Send Excel file command
bot.onText(/\/getexcel/, async (msg) => {
  const chatId = msg.chat.id
  const excelFilePath = "users_data.xlsx"

  try {
    await fs.access(excelFilePath)
    await bot.sendDocument(chatId, excelFilePath, {
      caption: "Foydalanuvchilar ma'lumotlari",
    })
  } catch (error) {
    bot.sendMessage(chatId, "Ma'lumotlar fayli hali yaratilmagan yoki mavjud emas.")
  }
})

console.log("Bot ishga tushdi...")

