# nflverse data inventory & reachability

_Probed 2026-08-08T01:02Z in CI (schema season 2024). Draft-day scope: none._

| dataset | status | rows | columns / error |
|---|---|---|---|
| `import_ids` | REACHABLE | 12470 | draft_ovr,rotoworld_id,stats_id,fleaflicker_id,draft_pick,merge_name,nfl_id,stats_global_id,age,rotowire_id,draft_round,swish_id,fantasy_data_id,name,pfr_id,position |
| `import_pbp_data[2024]` | REACHABLE | 49492 | play_id,game_id,old_game_id_x,home_team,away_team,season_type,week,posteam,posteam_type,defteam,side_of_field,yardline_100,game_date,quarter_seconds_remaining,half_seconds_remaining,game_seconds_remaining |
| `import_weekly_data[2024]` | REACHABLE | 5597 | player_id,player_name,player_display_name,position,position_group,headshot_url,recent_team,season,week,season_type,opponent_team,completions,attempts,passing_yards,passing_tds,interceptions |
| `import_ngs_data[passing]` | REACHABLE | 614 | season,season_type,week,player_display_name,player_position,team_abbr,avg_time_to_throw,avg_completed_air_yards,avg_intended_air_yards,avg_air_yards_differential,aggressiveness,max_completed_air_distance,avg_air_yards_to_sticks,attempts,pass_yards,pass_touchdowns |
| `import_ngs_data[rushing]` | REACHABLE | 601 | season,season_type,week,player_display_name,player_position,team_abbr,efficiency,percent_attempts_gte_eight_defenders,avg_time_to_los,rush_attempts,rush_yards,avg_rush_yards,rush_touchdowns,player_gsis_id,player_first_name,player_last_name |
| `import_ngs_data[receiving]` | REACHABLE | 1435 | season,season_type,week,player_display_name,player_position,team_abbr,avg_cushion,avg_separation,avg_intended_air_yards,percent_share_of_intended_air_yards,receptions,targets,catch_percentage,yards,rec_touchdowns,avg_yac |
| `import_snap_counts[2024]` | REACHABLE | 26615 | game_id,pfr_game_id,season,game_type,week,player,pfr_player_id,position,team,opponent,offense_snaps,offense_pct,defense_snaps,defense_pct,st_snaps,st_pct |
| `import_depth_charts[2024]` | REACHABLE | 37312 | season,club_code,week,game_type,depth_team,last_name,first_name,football_name,formation,gsis_id,jersey_number,position,elias_id,depth_position,full_name |
| `import_injuries[2024]` | REACHABLE | 6215 | season,game_type,team,week,gsis_id,position,full_name,first_name,last_name,report_primary_injury,report_secondary_injury,report_status,practice_primary_injury,practice_secondary_injury,practice_status,date_modified |
| `import_draft_picks` | REACHABLE | 257 | season,round,pick,team,gsis_id,pfr_player_id,cfb_player_id,pfr_player_name,hof,position,category,side,college,age,to,allpro |
| `import_schedules[2024]` | REACHABLE | 285 | game_id,season,game_type,week,gameday,weekday,gametime,away_team,away_score,home_team,home_score,location,result,total,overtime,old_game_id |
| `participation[2023]` | UNREACHABLE | 0 | AttributeError: module 'nfl_data_py' has no attribute 'import_pbp_participation' |
| `participation[2024]` | UNREACHABLE | 0 | AttributeError: module 'nfl_data_py' has no attribute 'import_pbp_participation' |
| `nflreadpy` | INSTALLED | 0 | successor available for migration eval |
| `load_ftn_charting[2022]` | REACHABLE | 41643 | ftn_game_id,nflverse_game_id,season,week,ftn_play_id,nflverse_play_id,starting_hash,qb_location,n_offense_backfield,n_defense_box,is_no_huddle,is_motion,is_play_action,is_screen_pass,is_rpo,is_trick_play |
| `load_ftn_charting[2023]` | REACHABLE | 48225 | ftn_game_id,nflverse_game_id,season,week,ftn_play_id,nflverse_play_id,starting_hash,qb_location,n_offense_backfield,n_defense_box,is_no_huddle,is_motion,is_play_action,is_screen_pass,is_rpo,is_trick_play |
| `load_ftn_charting[2024]` | REACHABLE | 48031 | ftn_game_id,nflverse_game_id,season,week,ftn_play_id,nflverse_play_id,starting_hash,qb_location,n_offense_backfield,n_defense_box,is_no_huddle,is_motion,is_play_action,is_screen_pass,is_rpo,is_trick_play |
| `nflreadpy.load_participation[2024]` | REACHABLE | 45919 | nflverse_game_id,old_game_id,play_id,possession_team,offense_formation,offense_personnel,defenders_in_box,defense_personnel,number_of_pass_rushers,players_on_play,offense_players,defense_players,n_offense,n_defense,ngs_air_yards,time_to_throw |
