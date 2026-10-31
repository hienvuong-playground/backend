CREATE TABLE products (
  id integer PRIMARY KEY CHECK (id > 0),
  title text NOT NULL,
  brand text NOT NULL,
  category text NOT NULL,
  tags text NOT NULL DEFAULT '',
  image text NOT NULL,
  price numeric(12, 2) NOT NULL CHECK (price >= 0),
  original_price numeric(12, 2) NOT NULL CHECK (original_price >= 0),
  rating numeric(2, 1) NOT NULL CHECK (rating BETWEEN 0 AND 5),
  reviews integer NOT NULL CHECK (reviews >= 0),
  badge text NOT NULL DEFAULT '',
  about jsonb NOT NULL CHECK (jsonb_typeof(about) = 'array'),
  color text NOT NULL,
  stock boolean NOT NULL DEFAULT true
);
CREATE INDEX products_category_idx ON products (category);
