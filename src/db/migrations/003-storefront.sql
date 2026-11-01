CREATE TABLE promos (
  id integer PRIMARY KEY CHECK (id > 0),
  position integer NOT NULL,
  title text NOT NULL,
  image text NOT NULL,
  department text NOT NULL
);
CREATE TABLE categories (
  id integer PRIMARY KEY CHECK (id > 0),
  position integer NOT NULL,
  title text NOT NULL,
  department text NOT NULL,
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array')
);
