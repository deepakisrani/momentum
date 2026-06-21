-- scheduling_style is no longer used by the app (workout order is at the user's discretion).
alter table meso drop column if exists scheduling_style;
