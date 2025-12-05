-- Update handle_new_user function to automatically assign admin role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- Insert into profiles
  INSERT INTO public.profiles (id, email, name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'name');

  -- Insert into user_roles with 'admin' role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, 'admin');

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
