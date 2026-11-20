CREATE TYPE staff_role_enum_next AS ENUM ('admin', 'kitchen');

ALTER TABLE staff
  ALTER COLUMN role TYPE staff_role_enum_next
  USING (
    CASE
      WHEN role::text = 'kitchen' THEN 'kitchen'
      ELSE 'admin'
    END
  )::staff_role_enum_next;

DROP TYPE staff_role_enum;
ALTER TYPE staff_role_enum_next RENAME TO staff_role_enum;
