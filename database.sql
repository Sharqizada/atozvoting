CREATE DATABASE IF NOT EXISTS voting_system;

USE voting_system;

CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  badge_code VARCHAR(50) NOT NULL UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  role VARCHAR(80) NOT NULL DEFAULT 'Administrator',
  password_hash CHAR(64) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO admins (badge_code, full_name, role, password_hash, is_active)
VALUES (
  '15357920',
  'Admin User',
  'Administrator',
  'f9017ddfb9b549a2b12bee77a4e538ec87139dd32faee06dfb8e8884a02640f9',
  1
)
ON DUPLICATE KEY UPDATE
  full_name = VALUES(full_name),
  role = VALUES(role),
  password_hash = VALUES(password_hash),
  is_active = VALUES(is_active);
