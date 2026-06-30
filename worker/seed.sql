-- Wipe all data
DELETE FROM redemptions;
DELETE FROM no_show_flags;
DELETE FROM points_history;
DELETE FROM checkins;
DELETE FROM reservations;
DELETE FROM rewards;
DELETE FROM events;
DELETE FROM users;
DELETE FROM config;

-- Reset autoincrement counters
DELETE FROM sqlite_sequence WHERE name IN ('users','events','reservations','checkins','points_history','no_show_flags','rewards','redemptions');

-- Admin (password: Wreck123!)
INSERT INTO users (name, erider, r_number, class, fee_paid, role, password_hash, season_points, lifetime_points)
VALUES ('Madsen Cooper', 'madscoop', 'R11925460', 'SR', 1, 'admin', '$2a$04$QhY3ThaljownpYXY636JbetWFB.8fS5dcmk60ak8Kl7YqloPkDExi', 0, 0);

-- Students (password: Wreck123!)
INSERT INTO users (name, erider, r_number, class, fee_paid, role, password_hash, season_points, lifetime_points)
VALUES ('Bryce Hewatt', 'brewatt', 'R17171748', 'JR', 1, 'student', '$2a$04$QhY3ThaljownpYXY636JbetWFB.8fS5dcmk60ak8Kl7YqloPkDExi', 0, 0);

INSERT INTO users (name, erider, r_number, class, fee_paid, role, password_hash, season_points, lifetime_points)
VALUES ('Will Shoaf', 'wshoaf', 'R11984332', 'FR', 1, 'student', '$2a$04$QhY3ThaljownpYXY636JbetWFB.8fS5dcmk60ak8Kl7YqloPkDExi', 0, 0);

INSERT INTO users (name, erider, r_number, class, fee_paid, role, password_hash, season_points, lifetime_points)
VALUES ('J.P. Williams', 'williJP', 'R00401438', 'SR', 1, 'student', '$2a$04$QhY3ThaljownpYXY636JbetWFB.8fS5dcmk60ak8Kl7YqloPkDExi', 0, 0);

INSERT INTO users (name, erider, r_number, class, fee_paid, role, password_hash, season_points, lifetime_points)
VALUES ('Madsen Cooper', 'madsen', 'R11925461', 'SR', 1, 'student', '$2a$04$QhY3ThaljownpYXY636JbetWFB.8fS5dcmk60ak8Kl7YqloPkDExi', 0, 0);

-- Config defaults
INSERT INTO config (key, value) VALUES ('no_show_penalty_points', '150');
INSERT INTO config (key, value) VALUES ('season_rebate_threshold', '5');
INSERT INTO config (key, value) VALUES ('season_rebate_amount', '500');
