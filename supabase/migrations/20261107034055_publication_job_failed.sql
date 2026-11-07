-- B5.1 (D125): a publication always ends. When the job publishing (or taking down) a page fails or
-- is cancelled, including a job the reaper failed after its worker died, its publication goes from
-- pending to failed with the job's message (in details.error, as the jobs write it), as builds already do (mark_build_failed). Without it a
-- crashed job left the publication pending for ever: the page showed "publishing" and couldn't be
-- unpublished or moved to Trash.
create or replace function mark_publication_failed() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.kind in ('publish_vercel', 'unpublish_vercel', 'publish_shopify_page',
                  'unpublish_shopify_page', 'publish_shopify_editable')
     and new.status in ('failed', 'cancelled') and old.status is distinct from new.status
     and new.payload ? 'publication_id' then
    update publications
       set status = 'failed',
           details = coalesce(details, '{}'::jsonb) || jsonb_build_object(
             'error', coalesce(new.error ->> 'message', 'The job stopped before it finished.'))
     where id = (new.payload ->> 'publication_id')::uuid
       and org_id = new.org_id
       and status = 'pending';
  end if;
  return new;
end;
$$;

create trigger jobs_publication_failed after update of status on jobs
  for each row execute function mark_publication_failed();
