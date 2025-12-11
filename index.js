import express from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import swaggerUi from "swagger-ui-express";
import { Command } from "commander";
import { fileURLToPath } from "url";

const app = express();

// ---------- CLI ----------
const program = new Command();
program
  .requiredOption("-h, --host <host>", "Server host address")
  .requiredOption("-p, --port <port>", "Server port")
  .requiredOption("-c, --cache <path>", "Cache directory path");

program.parse(process.argv);
const options = program.opts();

const HOST = options.host;
const PORT = Number(options.port);
const CACHE_DIR = path.isAbsolute(options.cache)
  ? options.cache
  : path.join(process.cwd(), options.cache);
const INVENTORY_FILE = path.join(CACHE_DIR, "inventory.json");
const PHOTOS_DIR = path.join(CACHE_DIR, "photos");

fs.mkdirSync(PHOTOS_DIR, { recursive: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// ---------- Middleware ----------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------- Cache setup ----------
fs.mkdirSync(PHOTOS_DIR, { recursive: true });
if (!fs.existsSync(INVENTORY_FILE)) {
  fs.writeFileSync(INVENTORY_FILE, "[]");
}

// ---------- Helpers ----------
function loadInventory() {
  return JSON.parse(fs.readFileSync(INVENTORY_FILE, "utf-8"));
}

function saveInventory(data) {
  fs.writeFileSync(INVENTORY_FILE, JSON.stringify(data, null, 2));
}

// ---------- Multer ----------
const upload = multer({ dest: PHOTOS_DIR });

// ---------- ROUTES ----------

// ------- GET /RegisterForm.html -------
app.get("/RegisterForm.html", (req, res) => {
  res.sendFile(path.join(__dirname, "RegisterForm.html"));
});

// ------- GET /SearchForm.html -------
app.get("/SearchForm.html", (req, res) => {
  res.sendFile(path.join(__dirname, "SearchForm.html"));
});

// POST /register
app.post("/register", upload.single("photo"), (req, res) => {
  const { inventory_name, description } = req.body;
  if (!inventory_name) {
    return res.status(400).send("inventory_name is required");
  }

  const inventory = loadInventory();
  const id = inventory.length ? inventory.at(-1).id + 1 : 1;

  const item = {
    id,
    inventory_name,
    description: description || "",
    photoPath: `/inventory/${id}/photo`
  };

  inventory.push(item);
  saveInventory(inventory);

  if (req.file) {
    fs.renameSync(req.file.path, path.join(PHOTOS_DIR, `${id}.jpg`));
  }

  res.status(201).json(item);
});

// GET /inventory
app.get("/inventory", (req, res) => {
  res.json(loadInventory());
});

// GET /inventory/:id
app.get("/inventory/:id", (req, res) => {
  const item = loadInventory().find(i => i.id == req.params.id);
  if (!item) return res.sendStatus(404);
  res.json(item);
});

// PUT /inventory/:id
app.put("/inventory/:id", (req, res) => {
  const inventory = loadInventory();
  const item = inventory.find(i => i.id == req.params.id);
  if (!item) return res.sendStatus(404);

  if (req.body.inventory_name) item.inventory_name = req.body.inventory_name;
  if (req.body.description) item.description = req.body.description;

  saveInventory(inventory);
  res.json(item);
});

// PUT /inventory/:id/photo
app.put("/inventory/:id/photo", upload.single("photo"), (req, res) => {
  if (!req.file) return res.sendStatus(400);
  fs.renameSync(req.file.path, path.join(PHOTOS_DIR, `${req.params.id}.jpg`));
  res.send("Photo updated");
});

// GET /inventory/:id/photo
app.get("/inventory/:id/photo", (req, res) => {
  const photoPath = path.join(PHOTOS_DIR, `${req.params.id}.jpg`);

  if (!fs.existsSync(photoPath)) {
    return res.sendStatus(404);
  }

  res.sendFile(photoPath);
});



// DELETE /inventory/:id
app.delete("/inventory/:id", (req, res) => {
  let inventory = loadInventory();
  inventory = inventory.filter(i => i.id != req.params.id);
  saveInventory(inventory);
  res.send("Deleted");
});

// POST /search
app.post("/search", (req, res) => {
  const { id, has_photo } = req.body;

  const item = loadInventory().find(i => i.id == id);
  if (!item) return res.sendStatus(404);

  const includePhoto =
    has_photo === "1" ||
    has_photo === "on" ||
    has_photo === "true";

  const result = includePhoto
    ? item
    : {
        id: item.id,
        inventory_name: item.inventory_name,
        description: item.description
      };

  res.status(201).json(result);
});


// ---------- Swagger ----------
const swaggerSpec = {
  openapi: "3.0.0",
  info: {
    title: "Inventory API",
    version: "1.0.0",
    description: "Web API для керування інвентарем"
  },

  components: {
    schemas: {
      InventoryItem: {
        type: "object",
        properties: {
          id: {
            type: "integer",
            description: "Унікальний ідентифікатор інвентарної речі"
          },
          inventory_name: {
            type: "string",
            description: "Назва речі"
          },
          description: {
            type: "string",
            description: "Опис речі"
          },
          photoPath: {
            type: "string",
            nullable: true,
            description: "URL для отримання фото речі"
          }
        }
      }
    }
  },

  paths: {
    "/register": {
  post: {
    summary: "Реєстрація нової інвентарної речі",
    requestBody: {
      required: true,
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            required: ["inventory_name"],
            properties: {
              inventory_name: { type: "string" },
              description: { type: "string" },
              photo: { type: "string", format: "binary" }
            }
          }
        }
      }
    },
    responses: {
      201: {
        description: "Created",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/InventoryItem"
            }
          }
        }
      }
    }
  }
},

"/inventory": {
  get: {
    summary: "Отримати список усіх пристроїв",
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: {
              type: "array",
              items: {
                $ref: "#/components/schemas/InventoryItem"
              }
            }
          }
        }
      }
    }
  }
},
"/search": {
  post: {
    summary: "Пошук пристрою за ID",
    requestBody: {
      required: true,
      content: {
        "application/x-www-form-urlencoded": {
          schema: {
            type: "object",
            required: ["id"],
            properties: {
              id: { type: "integer" },
              has_photo: { type: "string" }
            }
          }
        }
      }
    },
    responses: {
      201: {
        description: "Found",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/InventoryItem"
            }
          }
        }
      },
      404: { description: "Not found" }
    }
  }
},
"/inventory/{id}": {
  get: {
    summary: "Отримати інвентарну річ за ID",
    description: "Повертає інформацію про інвентарну річ за її унікальним ідентифікатором",
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        description: "ID інвентарної речі",
        schema: {
          type: "integer",
          example: 1
        }
      }
    ],
    responses: {
      200: {
        description: "OK",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/InventoryItem"
            }
          }
        }
      },
      404: {
        description: "Item not found"
      }
    }
  },
    put: {
      summary: "Оновити дані інвентарної речі",
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "integer" },
          description: "ID інвентарної речі"
        }
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                inventory_name: { type: "string" },
                description: { type: "string" }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: "Updated",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/InventoryItem"
              }
            }
          }
        },
        404: { description: "Not Found" }
      }
    },

    delete: {
      summary: "Видалити інвентарну річ",
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "integer" }
        }
      ],
      responses: {
        200: { description: "Deleted" },
        404: { description: "Not Found" }
      }
    }
  },

  "/inventory/{id}/photo": {
  get: {
    summary: "Отримати фото інвентарної речі",
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "integer" }
      }
    ],
    responses: {
      200: {
        description: "OK",
        content: {
          "image/jpeg": {
            schema: {
              type: "string",
              format: "binary"
            }
          }
        }
      },
      404: { description: "Photo not found" }
    }
  },

  put: {
    summary: "Завантажити або оновити фото інвентарної речі",
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "integer" }
      }
    ],
    requestBody: {
      required: true,
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            required: ["photo"],
            properties: {
              photo: {
                type: "string",
                format: "binary"
              }
            }
          }
        }
      }
    },
    responses: {
      200: { description: "Photo updated" },
      400: { description: "Bad Request" }
    }
  }
}
  }
};


app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ---------- START ----------
app.listen(PORT, HOST, () => {
  console.log(`🚀 http://${HOST}:${PORT}`);
});
