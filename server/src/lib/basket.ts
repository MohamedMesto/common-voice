import * as sendRequest from 'request-promise-native';
import { getConfig } from '../config-helper';
import { getMySQLInstance } from './model/db/mysql';

const { BASKET_API_KEY, PROD } = getConfig();
const db = getMySQLInstance();

export const API_URL = PROD
  ? 'https://basket.mozilla.org'
  : 'https://basket-dev.allizom.org';

function toISO(date: string) {
  return date ? new Date(date).toISOString().slice(0, -5) + 'Z' : null;
}

export async function sync(client_id: string) {
  const [[row]] = await db.query(
    `
      SELECT
        email,
        basket_token,
        MIN(clips.created_at) AS first_contribution_date,
        current_goal.created_at AS goal_created_at,
        current_goal.days_interval,
        MAX(awards.created_at) AS goal_reached_at
      FROM user_clients
      LEFT JOIN clips ON user_clients.client_id = clips.client_id
      LEFT JOIN custom_goals goals ON user_clients.client_id = goals.client_id
      LEFT JOIN custom_goals current_goal ON (
        user_clients.client_id = current_goal.client_id AND
        current_goal.created_at >= goals.created_at
      )
      LEFT JOIN awards ON current_goal.id = awards.custom_goal_id
      WHERE user_clients.client_id = ?
      GROUP BY user_clients.client_id
    `,
    [client_id]
  );
  if (!row.basket_token) {
    return;
  }
  await sendRequest({
    uri: API_URL + '/news/common-voice-goals/',
    method: 'POST',
    headers: {
      'x-api-key': BASKET_API_KEY,
    },
    form: {
      email: row.email,

      first_contribution_date: toISO(row.first_contribution_date),

      created_at: toISO(row.goal_created_at),
      days_interval: row.days_interval,
      goal_reached_at: toISO(row.goal_reached_at),
    },
  });
}
