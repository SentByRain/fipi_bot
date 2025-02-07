import { hydrate } from "@grammyjs/hydrate";
import { Bot, GrammyError, HttpError } from "grammy";

import cron from "node-cron";

import path from "path";
import process from "process";
import fs from "fs";
import fs_async from "fs/promises";

import { getRandomTasks } from "./task_picker.js";

const currentFolder = process.cwd();
const BOT_TOKEN_PATH = path.join(currentFolder, "bot_token.json");
const TEACHER_ID_PATH = path.join(currentFolder, "teacher_id.json");

const usersInfoFile = "users_info.json";
const USERS_INFO_PATH = path.join(currentFolder, usersInfoFile);

const file_content = fs.readFileSync(BOT_TOKEN_PATH);
const bot_token = JSON.parse(file_content).bot_token;

const teacherId = JSON.parse(fs.readFileSync(TEACHER_ID_PATH)).teacher_id;
process.env.BOT_TOKEN = bot_token;

async function loadUsers() {
  fs.openSync(USERS_INFO_PATH, "a"); //create new file, if it's not exist

  try {
    const loadedUsers = await fs_async.readFile(USERS_INFO_PATH);
    return Object.keys(loadedUsers).length ? JSON.parse(loadedUsers) : [];
  } catch (err) {
    console.error(err);
  }
}

function isNewUser(user) {
  return (
    users.findIndex(
      (oldUser) => JSON.stringify(oldUser) === JSON.stringify(user)
    ) !== -1
  );
}

function getCurrentUser(chat_id) {
  return users.find((user) => user.chat_id === chat_id);
}

function deleteUser(chat_id) {
  users.splice(
    users.findIndex((user) => user.chat_id === chat_id),
    1
  );
  fs_async.writeFile(USERS_INFO_PATH, JSON.stringify(users));
}

function getUsername(user) {
  return user.nickname
    ? user.nickname
    : user.name && user.surname
    ? `${user.name} ${user.surname}`
    : user.name
    ? user.name
    : user.chat_id;
}

class User {
  constructor(ctx) {
    this.chat_id = ctx.chat.id;
    this.nickname = ctx.chat.username;
    this.name = ctx.chat.first_name;
    this.surname = ctx.chat.last_name;
  }
}

async function sendTasks(user) {
  const randomTasks = getRandomTasks(3);

  console.log(`sent tasks to ${getUsername(user)}`);
  for (let task of randomTasks) {
    try {
      await bot.api.sendMessage(user.chat_id, task);
    } catch (err) {
      if (err instanceof GrammyError) {
        if (err.error_code === 403) {
          const deletingUser = getCurrentUser(err.payload.chat_id);
          deleteUser(err.payload.chat_id);
          return console.log(
            `User ${getUsername(deletingUser)}'s blocked the bot`
          );
        }
        return console.error("Error in request:", err.description);
      }
      return console.error(err);
    }
  }
}

const bot = new Bot(process.env.BOT_TOKEN);
bot.use(hydrate());

//error handler
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error("Error in request:", e.description);
  } else if (e instanceof HttpError) {
    console.error("Could not contact Telegram:", e);
  } else {
    console.error("Unknown error:", e);
  }
});

bot.api.setMyCommands([
  { command: "start", description: "Запуск бота" },
  { command: "send_task", description: "Отправить задание" },
  { command: "stop", description: "Отключить ежедневную отправку заданий" },
]);

// message when a user starts conversation
bot.command("start", async (ctx) => {
  const user = new User(ctx);
  if (isNewUser(user)) {
    return await ctx.reply("Вы уже запустили бота.");
  }
  console.log(`New user ${getUsername(user)} added.`);
  users.push(user);
  fs_async.writeFile(USERS_INFO_PATH, JSON.stringify(users));
  await ctx.reply(
    'Привет, я бот. Помогу тебе готовиться к ЕГЭ по истории вместе с @sans_sensss.\n\nСейчас вышлю задания. Решить их нужно сегодня, ответы отправляй прямо сюда, @sans_sensss их проверит.\n\nА с завтрашнего дня буду присылать задания сам. Если захочешь порешать еще больше заданий, нажми в меню кнопку "Отправить задание".'
  );
  setTimeout(() => sendTasks(user), 30 * 1000);
});

bot.command("send_task", async (ctx) => {
  const currentUser = new User(ctx);
  console.log(
    `User ${getUsername(currentUser)} requested new tasks to chat id ${
      currentUser.chat_id
    }.`
  );
  sendTasks(currentUser);
});

bot.command("stop", async (ctx) => {
  const currentUser = new User(ctx);
  await ctx.reply(
    'Бот больше не будет присылать ежедневные задания. Для возобновления нажмите в меню кнопку "Запуск бота"'
  );
  console.log(`User ${getUsername(currentUser)}'s deleted the bot`);
  deleteUser(currentUser.chat_id);
});

const users = await loadUsers();

bot.start();
console.log("Бот запущен");

const task = cron.schedule(
  "30 11 * * *",
  () => {
    console.log("Отправления по таймеру:");
    users.forEach(async (user) => {
      sendTasks(user);
    });
  },
  {
    timezone: "Europe/Moscow",
  }
);
task.start();

//listening only messages that replied to task messages - maybe grammy provides appropriate filter query but i couldn't find it
bot.on("message").filter(
  (ctx) => ctx.message.reply_to_message,
  async (ctx) => {
    const currentUser = new User(ctx);

    //task
    await bot.api.forwardMessage(
      teacherId,
      ctx.message.chat.id,
      ctx.message.reply_to_message.message_id
    );
    //user answer
    await bot.api.forwardMessage(
      teacherId,
      ctx.message.chat.id,
      ctx.message.message_id
    );
    console.log(`Forwarded ${getUsername(currentUser)}'s message to teacher.`);
    await ctx.reply("Спасибо! Ваш ответ отправлен @sans_sensss на проверку)");
  }
);
