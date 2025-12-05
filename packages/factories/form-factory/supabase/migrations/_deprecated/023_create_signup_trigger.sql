-- migrations/023_create_signup_trigger.sql
CREATE TRIGGER on_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION handle_new_user_signup();
