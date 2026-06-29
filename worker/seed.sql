-- All passwords = Wreck2026! (bcrypt cost 4)
INSERT OR IGNORE INTO users (name, erider, r_number, class, fee_paid, role, password_hash, season_points, lifetime_points) VALUES
  ('Madsen Cooper',  'madscoop',  'R11925460', 'SR', 1, 'admin',   '$2a$04$xIcZ2KD7P2Rx4zZVk.RNDeJIjRSDIipCoxEiEMNZXeYL9xg0GfTsK', 2840, 8420),
  ('Andrew Lils',    'andrewl',   'R11873238', 'SR', 1, 'student', '$2a$04$xIcZ2KD7P2Rx4zZVk.RNDeJIjRSDIipCoxEiEMNZXeYL9xg0GfTsK',  100,  1200),
  ('J.P. Williams',  'jpwilliams','R00401438', 'SR', 1, 'student', '$2a$04$xIcZ2KD7P2Rx4zZVk.RNDeJIjRSDIipCoxEiEMNZXeYL9xg0GfTsK',  100,   850),
  ('Will Shoaf',     'wshoaf',    'R11984332', 'FR', 1, 'student', '$2a$04$xIcZ2KD7P2Rx4zZVk.RNDeJIjRSDIipCoxEiEMNZXeYL9xg0GfTsK',    0,   100),
  ('Bryce Hewatt',   'brewatt',   'R17171748', 'JR', 1, 'student', '$2a$04$xIcZ2KD7P2Rx4zZVk.RNDeJIjRSDIipCoxEiEMNZXeYL9xg0GfTsK',    0,     0);

-- Events with windows relative to "now" so demo is always live
-- Football vs Kansas: reservation window OPEN (Mon 8AM → Tue Noon of current week)
-- Football vs ACU: claim window OPEN (selected status for andrewl)
-- Football vs Texas: future
-- Soccer vs TCU: open mode
-- MBB vs Kansas: past + checked in
-- Football vs Baylor: past, no-show flag
INSERT OR IGNORE INTO events (name, sport, game_datetime, high_impact, mode, capacity, ticket_office_allotment, attendance_points, status,
  reservation_opens, reservation_closes, claim_opens, claim_closes, waitlist_cascade, open_claim_start, drop_closes) VALUES
  ('Football vs. Kansas',
   'Football', datetime('now', '+7 days'), 1, 'reservation_required', 9500, 500, 150, 'scheduled',
   datetime('now', '-1 days'), datetime('now', '+1 days'),
   datetime('now', '+2 days'), datetime('now', '+3 days'),
   datetime('now', '+3 days', '+1 minute'), datetime('now', '+4 days'),
   datetime('now', '+6 days')),

  ('Football vs. ACU',
   'Football', datetime('now', '+5 days'), 0, 'reservation_required', 9500, 500, 100, 'selection_complete',
   datetime('now', '-4 days'), datetime('now', '-3 days'),
   datetime('now', '-1 days'), datetime('now', '+2 days'),
   datetime('now', '+2 days', '+1 minute'), datetime('now', '+3 days'),
   datetime('now', '+4 days')),

  ('Football vs. Texas',
   'Football', datetime('now', '+14 days'), 1, 'reservation_required', 9500, 500, 150, 'scheduled',
   datetime('now', '+7 days'), datetime('now', '+9 days'),
   datetime('now', '+9 days', '+2 hours'), datetime('now', '+10 days'),
   datetime('now', '+10 days', '+1 minute'), datetime('now', '+11 days'),
   datetime('now', '+13 days')),

  ('Soccer vs. TCU',
   'Soccer', datetime('now', '+3 days'), 0, 'open', 2000, 0, 50, 'scheduled',
   NULL, NULL, NULL, NULL, NULL, NULL, NULL),

  ('Men''s Basketball vs. Kansas',
   'Men''s Basketball', datetime('now', '-7 days'), 0, 'reservation_required', 4000, 200, 100, 'selection_complete',
   datetime('now', '-14 days'), datetime('now', '-13 days'),
   datetime('now', '-12 days'), datetime('now', '-11 days'),
   datetime('now', '-11 days', '+1 minute'), datetime('now', '-10 days'),
   datetime('now', '-8 days')),

  ('Football vs. Baylor',
   'Football', datetime('now', '-14 days'), 0, 'reservation_required', 9500, 500, 100, 'selection_complete',
   datetime('now', '-21 days'), datetime('now', '-20 days'),
   datetime('now', '-19 days'), datetime('now', '-18 days'),
   datetime('now', '-18 days', '+1 minute'), datetime('now', '-17 days'),
   datetime('now', '-15 days'));

-- andrewl is selected for Football vs ACU (event 2)
INSERT OR IGNORE INTO reservations (user_id, event_id, status, reserved_at, selected_at) VALUES
  (2, 2, 'selected', datetime('now', '-4 days'), datetime('now', '-2 days'));

-- andrewl checked in to MBB vs Kansas (event 5)
INSERT OR IGNORE INTO reservations (user_id, event_id, status, reserved_at, selected_at, claimed_at) VALUES
  (2, 5, 'claimed', datetime('now', '-14 days'), datetime('now', '-12 days'), datetime('now', '-10 days'));
INSERT OR IGNORE INTO checkins (user_id, event_id, scanned_at, points_awarded) VALUES
  (2, 5, datetime('now', '-7 days'), 100);
INSERT OR IGNORE INTO points_history (user_id, event_id, amount, type, description, created_at) VALUES
  (2, 5, 100, 'attendance', 'Men''s Basketball vs. Kansas', datetime('now', '-7 days'));

-- andrewl no-show for Football vs Baylor (event 6)
INSERT OR IGNORE INTO reservations (user_id, event_id, status, reserved_at, selected_at, claimed_at) VALUES
  (2, 6, 'claimed', datetime('now', '-21 days'), datetime('now', '-19 days'), datetime('now', '-17 days'));
INSERT OR IGNORE INTO no_show_flags (user_id, event_id, penalty_points, dispute_status, created_at) VALUES
  (2, 6, 200, 'pending', datetime('now', '-13 days'));

-- Rewards catalog
INSERT OR IGNORE INTO rewards (name, category, points_cost, active) VALUES
  ('Early Entry Pass',   'Priority Access',      300,  1),
  ('Raider Red Tee',     'Merchandise',          500,  1),
  ('Raider Walk Access', 'Priority Access',      750,  1),
  ('Sideline Pass',      'Exclusive Experience', 2000, 1),
  ('Meet the Team',      'Exclusive Experience', 3500, 1),
  ('Locker Room Tour',   'Exclusive Experience', 5000, 0);

-- Config
INSERT OR IGNORE INTO config (key, value) VALUES
  ('penalty_standard',   '150'),
  ('penalty_high_impact','200'),
  ('svc_price',          '500'),
  ('svc_cap',            '2000');
