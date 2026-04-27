module.exports = {
  apps: [
    {
      name: "foodsupply-api",
      script: "server/src/index.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "development",
        PORT: 5000,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 5000,
      },
      max_memory_restart: "400M",
      time: true,
    },
  ],
};

