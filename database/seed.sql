INSERT INTO categories (name, slug, description) VALUES
  ('Икра', 'ikra', 'Лососевая икра в упаковках 250 г и 500 г'),
  ('Рыба холодного копчения', 'holodnoe-kopchenie', 'Сёмга, эсколар и другая рыба холодного копчения'),
  ('Слабосолёная рыба', 'slabosolenaya-ryba', 'Форель и сёмга пластом'),
  ('Свежемороженая рыба', 'svezhemorozhenaya-ryba', 'Стейки, филе и целая рыба'),
  ('Морепродукты', 'moreprodukty', 'Креветки, кальмары и морские деликатесы'),
  ('Закуски', 'zakuski', 'Пивные наборы и готовые закуски')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

INSERT INTO products (category_id, name, description, details, price_per_kg, package_price, package_grams, unit_label, badge, color) VALUES
  ((SELECT id FROM categories WHERE slug = 'ikra'), 'Икра горбуши 0.5 кг', 'Икра горбуши зернистая, дальневосточная.', 'Расфасовка 0.5 кг.', 70000, 35000, 500, 'упаковка 500 г', 'Хит', '#e85d3f'),
  ((SELECT id FROM categories WHERE slug = 'ikra'), 'Икра горбуши 250 г', 'Икра горбуши зернистая, дальневосточная.', 'Стоимость 17 500 тенге за 250 г.', 70000, 17500, 250, 'банка 250 г', 'Популярно', '#f0784a'),
  ((SELECT id FROM categories WHERE slug = 'holodnoe-kopchenie'), 'Сёмга Х/К', 'Рыба холодного копчения. Расфасовка от 0.6 до 1.3 кг.', 'Примерная стоимость 12 450 тенге.', 9500, NULL, NULL, 'за кг', 'Копчение', '#ff9f43'),
  ((SELECT id FROM categories WHERE slug = 'holodnoe-kopchenie'), 'Эсколар Х/К', 'Эсколар холодного копчения. Расфасовка от 0.6 до 1.2 кг.', 'Примерная стоимость 9 360 тенге.', 7800, NULL, NULL, 'за кг', 'Нежный вкус', '#4f8a8b'),
  ((SELECT id FROM categories WHERE slug = 'slabosolenaya-ryba'), 'Форель слабосолёная', 'Форель слабосолёная пластом. Вес 2.2-2.8 кг.', 'Примерная стоимость одной половины около 25 200 тенге.', 9000, NULL, NULL, 'за кг', 'Пласт', '#ff7a59'),
  ((SELECT id FROM categories WHERE slug = 'svezhemorozhenaya-ryba'), 'Сёмга стейки', 'Сёмга свежемороженая стейками. Расфасовка одной рыбой 5-5.7 кг.', 'Примерная стоимость 35 300 тенге.', 6200, NULL, NULL, 'за кг', 'Стейки', '#ee6c4d'),
  ((SELECT id FROM categories WHERE slug = 'svezhemorozhenaya-ryba'), 'Филе судака', 'Филе судака в глазури. Расфасовка 1.5-2.0 кг.', 'Филе для запекания, жарки и домашней кухни.', 3100, NULL, NULL, 'за кг', 'Филе', '#3d8bfd'),
  ((SELECT id FROM categories WHERE slug = 'svezhemorozhenaya-ryba'), 'Тунец филе', 'Тунец филе свежемороженый. Расфасовка 0.5 кг.', 'Вес одного стейка 50-100 г.', 5200, NULL, NULL, 'за кг', 'Порционно', '#34656d'),
  ((SELECT id FROM categories WHERE slug = 'svezhemorozhenaya-ryba'), 'Сибас', 'Сибас потрошенный в упаковке. Вес одной рыбы 300-400 г.', 'Упаковка 1 кг.', 7200, 7200, 1000, 'упаковка 1 кг', '1 кг', '#2c7da0'),
  ((SELECT id FROM categories WHERE slug = 'moreprodukty'), 'Креветки Elit', 'Креветки свежемороженые без головы в панцире, размер 16-20.', 'Расфасовка 1 кг.', 4500, 4500, 1000, 'упаковка 1 кг', '16/20', '#fb8500'),
  ((SELECT id FROM categories WHERE slug = 'moreprodukty'), 'Филе кальмара', 'Кальмары большие Amiko.', 'Расфасовка 1 кг.', 3000, 3000, 1000, 'упаковка 1 кг', 'Amiko', '#8ecae6'),
  ((SELECT id FROM categories WHERE slug = 'zakuski'), 'Пивной набор', 'Пивной набор. Расфасовка от 0.8 до 1.2 кг.', 'Примерная стоимость 4 800 тенге.', 4000, NULL, NULL, 'за кг', 'Закуска', '#bc6c25')
ON CONFLICT (name) DO UPDATE SET
  category_id = EXCLUDED.category_id,
  description = EXCLUDED.description,
  details = EXCLUDED.details,
  price_per_kg = EXCLUDED.price_per_kg,
  package_price = EXCLUDED.package_price,
  package_grams = EXCLUDED.package_grams,
  unit_label = EXCLUDED.unit_label,
  badge = EXCLUDED.badge,
  color = EXCLUDED.color,
  is_active = TRUE;