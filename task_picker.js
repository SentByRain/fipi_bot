import fs from "fs";
import path from "path";
import process from "process";

const subjects = ["history"];
const currentFolder = process.cwd();
const currentDir = path.join(currentFolder, subjects[0]);

const taskFiles = fs.readdirSync(currentDir);

export function getRandomTasks(tasksFromFile) {
  const requiredTasks = taskFiles.map((file) => {
    const filePath = path.join(currentDir, file);
    const tasks = fs.readFileSync(filePath);
    const parsedTasks = JSON.parse(tasks);
    const randomTasks = [];
    for (let i = 0; i < tasksFromFile; i++) {
      const randomTask =
        parsedTasks[Math.floor(Math.random() * parsedTasks.length)];
      randomTasks.push(randomTask.task_text); //need to fix it when i change structure of json files
    }
    return randomTasks;
  });
  return requiredTasks.flat();
}
