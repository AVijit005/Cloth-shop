# Cloth-Shop: Modern Fashion E-Commerce Platform

Welcome to **Cloth-Shop**, a feature-rich, production-ready Flask web application designed for seamless online clothes shopping. The application features elegant HSL-based styling, clean glassmorphism aesthetics, a responsive multi-category layout, customer loyalty programs, gamified quests, custom outfit planning, product comparison modules, and role-based administration panels.

This project is fully restructured, optimized, and ready for deployment on **Render** (via waitress-serve).

---

## Developer Details

- **Developed By**: Avijit (AVijit005)
- **GitHub**: [AVijit005](https://github.com/AVijit005)
- **Role**: Full-Stack Web Developer

---

## Features

1. **Elegant Design**: Responsive layout with modern glassmorphism, HSL tailormade colors, and aurora background micro-animations.
2. **User Authentication**: Secure signup and login with role-based segregation (`admin` and `customer`).
3. **Category Browsing**: Seamless category sorting (Men, Women, Kids) and search filters.
4. **Interactive Shopping Cart**: Live quantity adjustments, dynamic price calculations, and coupon application support.
5. **Tiered Loyalty Program**: Loyalty point accrual, level status tracker, and discounts on checkout.
6. **Gamified Customer Quests**: Active board of daily quests (first signup, first order, add review) to earn points.
7. **Size Finder & Comparison**: AI-assisted clothing size selector and multi-item side-by-side spec comparison table.
8. **Admin Panel**: Real-time product inventory creation, order status fulfillment logs, loyalty system configurations, and statistics dashboard.

---

## Local Setup Instructions

Follow these steps to run the application locally on your Windows machine:

### 1. Prerequisites
- **Python**: Python 3.12+ installed.
- **MySQL**: MySQL Server installed and running locally.

### 2. Clone the Project
```bash
git clone https://github.com/AVijit005/Cloth-shop.git
cd Cloth-shop
```

### 3. Create a Virtual Environment
Initialize a clean Python virtual environment to manage dependencies:
```powershell
python -m venv venv
venv\Scripts\activate
```

### 4. Install Dependencies
```bash
pip install -r requirements.txt
```

### 5. Setup MySQL Database
1. Open your MySQL Command Line Client or preferred GUI tool (like MySQL Workbench, phpMyAdmin, or DBeaver).
2. Execute the schema queries defined in `database.sql` to initialize the database:
```sql
SOURCE database.sql;
```
This command creates the database `shibani_store` and all its constituent tables.

### 6. Environment Variables Setup
Create a `.env` file in the root directory (based on `.env.example`):
```env
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_mysql_password
MYSQL_DATABASE=shibani_store
SECRET_KEY=generate_your_secret_key_hex
```

### 7. Run the Application
Start the Flask application locally:
```bash
python app.py
```
Open your browser and navigate to `http://127.0.0.1:5000` to interact with the web app.

---

## Deployment on Render

This project is configured with a `render.yaml` file to facilitate direct, one-click hosting on Render.

### Render Service Setup
1. Push your repository to your GitHub account: `https://github.com/AVijit005/Cloth-shop.git`.
2. Log in to your [Render Dashboard](https://dashboard.render.com).
3. Click **New +** and select **Blueprint**.
4. Connect your GitHub repository.
5. Render will automatically parse the `render.yaml` file, spin up a Python web service using the Waitress WSGI server (`waitress-serve --host=0.0.0.0 --port=$PORT app:app`), and install all dependencies.

### Database Hosting on Render / Cloud
To connect a cloud MySQL database:
1. Spin up a MySQL instance on Render, Railway, Aiven, or AWS RDS.
2. Set the following environment variables in your Render Web Service settings:
   - `MYSQL_HOST`
   - `MYSQL_USER`
   - `MYSQL_PASSWORD`
   - `MYSQL_DATABASE`
   - `MYSQL_PORT`
   - `SECRET_KEY`

---

## Troubleshooting

- **Database Connection Failure**: If the app fails to connect to MySQL on boot, it will gracefully fall back to a temporary memory store (`memory_store`) so the frontend remains browseable. Check your `.env` credentials and verify your MySQL service status if database operations do not persist.
- **Waitress Server Port Issues**: By default, Render binds web services to the `$PORT` environment variable. Waitress is configured to dynamically resolve and host on this port automatically.

---

## License

This project is licensed under the **MIT License**.

Anyone is free to copy, modify, distribute, and contribute to this repository. Pull requests are highly encouraged.

```text
MIT License

Copyright (c) 2026 Avijit

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
```
