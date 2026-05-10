package com.natsuyasai.multicolumnx

fun isInternalUrl(url: String): Boolean {
    return url.startsWith("https://x.com") ||
        url.startsWith("https://twitter.com") ||
        url.startsWith("http://localhost") ||
        url.startsWith("about:") ||
        url.startsWith("blob:")
}
