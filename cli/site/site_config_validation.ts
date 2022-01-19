import { checkObject, checkOrigin } from '../../common/check.ts';
import { SiteConfig, SiteMetadata, SiteSearchConfig } from './site_config.ts';

// deno-lint-ignore no-explicit-any
export function checkSiteConfig(config: any): SiteConfig {
    checkObject('config', config);

    const { organization, organizationSuffix, organizationSvg, organizationUrl, product, productRepo, productSvg, contentRepo, themeColor, themeColorDark, search, siteMetadata } = config;
    if (organization !== undefined) checkNotBlankString('organization', organization);
    if (organizationSuffix !== undefined) checkNotBlankString('organizationSuffix', organizationSuffix);
    if (organizationSvg !== undefined) checkNotBlankString('organizationSvg', organizationSvg);
    if (organizationUrl !== undefined) checkNotBlankString('organizationUrl', organizationUrl);
    checkNotBlankString('product', product);
    checkRepo('productRepo', productRepo);
    if (productSvg !== undefined) checkNotBlankString('productSvg', productSvg);
    checkRepo('contentRepo', contentRepo);
    checkColor('themeColor', themeColor);
    checkColor('themeColorDark', themeColorDark);
    if (themeColorDark && !themeColor) throw new Error(`themeColor required when themeColorDark defined`);
    if (search !== undefined) checkSearch(search);
    checkSiteMetadata(siteMetadata);
    return { organization, organizationSuffix, organizationSvg, organizationUrl, product, productRepo, productSvg, contentRepo, themeColor, themeColorDark, search, siteMetadata };
}

//

// deno-lint-ignore no-explicit-any
function checkNotBlankString(name: string, value: any): value is string {
    if (typeof value !== 'string' || value === '') throw new Error(`Bad ${name}: ${value}`);
    return true;
}

// deno-lint-ignore no-explicit-any
function checkSiteMetadata(siteMetadata: any): SiteMetadata {
    const { title, description, twitterUsername, image, imageAlt, origin, faviconIco, faviconSvg, faviconMaskSvg, faviconMaskColor, manifest } = siteMetadata;
    checkNotBlankString('title', title);
    checkNotBlankString('description', description);
    checkTwitterUsername('twitterUsername', twitterUsername);
    if (image !== undefined) checkNotBlankString('image', image);
    if (imageAlt !== undefined) checkNotBlankString('imageAlt', imageAlt);
    if (origin !== undefined) checkOrigin('origin', origin);
    if (faviconIco !== undefined) checkNotBlankString('faviconIco', faviconIco);
    if (faviconSvg !== undefined) checkNotBlankString('faviconSvg', faviconSvg);
    if (faviconMaskSvg !== undefined) checkNotBlankString('faviconMaskSvg', faviconMaskSvg);
    if (faviconMaskColor !== undefined) checkColor('faviconMaskColor', faviconMaskColor);
    if (faviconMaskColor && !faviconMaskSvg) throw new Error(`faviconMaskSvg required when faviconMaskColor defined`);
    if (!faviconMaskColor && faviconMaskSvg) throw new Error(`faviconMaskColor required when faviconMaskSvg defined`);
    if (manifest !== undefined) checkObject('manifest', manifest);
    return { title, description, twitterUsername, image, imageAlt, origin, faviconIco, faviconSvg, faviconMaskSvg, faviconMaskColor, manifest };
}

// deno-lint-ignore no-explicit-any
function checkColor(name: string, value: any): value is string | undefined {
    if (value === undefined) return true;
    if (typeof value !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(value)) throw new Error(`Bad ${name}: ${value}`);
    return true;
}

// deno-lint-ignore no-explicit-any
function checkRepo(name: string, value: any): value is string | undefined {
    if (value === undefined) return true;
    if (typeof value !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) throw new Error(`Bad ${name}: ${value}`);
    return true;
}

// deno-lint-ignore no-explicit-any
function checkTwitterUsername(name: string, value: any): value is string | undefined {
    if (value === undefined) return true;
    if (typeof value !== 'string' || !/^@\w+$/.test(value)) throw new Error(`Bad ${name}: ${value}`);
    return true;
}

// deno-lint-ignore no-explicit-any
function checkSearch(search: any): SiteSearchConfig {
    const { indexName, apiKey, appId } = search;
    checkNotBlankString('indexName', indexName);
    checkNotBlankString('apiKey', apiKey);
    checkNotBlankString('appId', appId);
    return { indexName, apiKey, appId };
}
