/**
 * External dependencies
 */

import { get } from 'lodash';

/**
 * Internal dependencies
 */
import getRawSite from 'state/selectors/get-raw-site';

/**
 * Returns a site's URL or null if the site doesn't exist or the URL is unknown
 *
 * @param  {Object}  state  Global state tree
 * @param  {Number}  siteId Site ID
 * @return {?String}        URL of site if known
 */
export default function getSiteUrl( state, siteId ) {
	return get( getRawSite( state, siteId ), 'URL', null );
}
