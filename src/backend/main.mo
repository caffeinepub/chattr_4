import Map "mo:core/Map";
import Time "mo:core/Time";
import List "mo:core/List";
import Nat "mo:core/Nat";
import Int "mo:core/Int";
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import Runtime "mo:core/Runtime";
import Text "mo:core/Text";
import MixinStorage "blob-storage/Mixin";
import OutCall "http-outcalls/outcall";

actor {
  include MixinStorage();

  type Category = {
    id : Nat;
    name : Text;
  };

  type Thread = {
    id : Nat;
    title : Text;
    categoryId : Nat;
    creatorSessionId : Text;
    createdAt : Int;
    lastActivity : Int;
    isArchived : Bool;
    isClosed : Bool;
    postCount : Nat;
    thumbnailUrl : ?Text;
    thumbnailType : Text;
    viewCount : Nat;
    reportCount : Nat;
  };

  type Post = {
    id : Nat;
    threadId : Nat;
    authorSessionId : Text;
    content : Text;
    mediaUrl : ?Text;
    mediaType : Text;
    createdAt : Int;
    isDeleted : Bool;
    linkPreview : ?OgMetadata;
  };

  type Ban = {
    sessionId : Text;
    reason : Text;
    timestamp : Int;
  };

  type UserProfile = {
    sessionId : Text;
    username : Text;
    avatarUrl : ?Text;
    points : Nat;
    level : Text;
    daysActive : Nat;
    lastActiveDate : Int;
  };

  type ThreadReport = {
    id : Nat;
    threadId : Nat;
    reporterSessionId : Text;
    reason : Text;
    createdAt : Int;
  };

  type Bookmark = {
    id : Nat;
    sessionId : Text;
    targetType : Text;
    targetId : Nat;
    createdAt : Int;
  };

  public type OgMetadata = {
    title : ?Text;
    description : ?Text;
    imageUrl : ?Text;
    siteName : ?Text;
  };

  var nextThreadId = 1;
  var nextPostId = 1;
  var nextCategoryId = 1;
  var nextReportId = 1;
  var nextBookmarkId = 1;
  var seeded = false;

  var categories = Map.empty<Nat, Category>();
  var threads = Map.empty<Nat, Thread>();
  var posts = Map.empty<Nat, Post>();
  var bans = Map.empty<Text, Ban>();
  var userProfiles = Map.empty<Text, UserProfile>();
  var threadReports = Map.empty<Nat, ThreadReport>();
  var bookmarks = Map.empty<Nat, Bookmark>();
  var threadViews = Map.empty<Nat, List.List<Text>>();

  public shared ({ caller }) func addCategory(name : Text) : async Category {
    let category : Category = {
      id = nextCategoryId;
      name;
    };
    categories.add(nextCategoryId, category);
    nextCategoryId += 1;
    category;
  };

  public query ({ caller }) func getCategories() : async [Category] {
    categories.values().toArray();
  };

  public shared ({ caller }) func deleteCategory(id : Nat) : async Bool {
    if (categories.containsKey(id)) {
      categories.remove(id);
      true;
    } else {
      false;
    };
  };

  public shared ({ caller }) func createThread(
    title : Text,
    categoryId : Nat,
    creatorSessionId : Text,
    thumbnailUrl : ?Text,
    thumbnailType : Text,
  ) : async Thread {
    let thread : Thread = {
      id = nextThreadId;
      title;
      categoryId;
      creatorSessionId;
      createdAt = Time.now();
      lastActivity = Time.now();
      isArchived = false;
      isClosed = false;
      postCount = 0;
      thumbnailUrl;
      thumbnailType;
      viewCount = 0;
      reportCount = 0;
    };
    threads.add(nextThreadId, thread);
    nextThreadId += 1;
    thread;
  };

  public query ({ caller }) func getThreads() : async [Thread] {
    threads.values().toArray().filter(func(t) { not t.isArchived });
  };

  public query ({ caller }) func getArchivedThreads() : async [Thread] {
    threads.values().toArray().filter(func(t) { t.isArchived or t.isClosed });
  };

  public query ({ caller }) func getAllThreads() : async [Thread] {
    threads.values().toArray();
  };

  public query ({ caller }) func getThread(id : Nat) : async ?Thread {
    threads.get(id);
  };

  public shared ({ caller }) func updateThread(id : Nat, isClosed : Bool, isArchived : Bool) : async Bool {
    switch (threads.get(id)) {
      case (null) { Runtime.trap("Thread not found") };
      case (?thread) {
        threads.add(id, { thread with isClosed; isArchived });
        true;
      };
    };
  };

  public shared ({ caller }) func createPost(
    threadId : Nat,
    authorSessionId : Text,
    content : Text,
    mediaUrl : ?Text,
    mediaType : Text,
    linkPreview : ?OgMetadata,
  ) : async Post {
    switch (threads.get(threadId)) {
      case (null) { Runtime.trap("Thread not found") };
      case (?thread) {
        if (bans.containsKey(authorSessionId)) {
          Runtime.trap("User is banned");
        };

        let post : Post = {
          id = nextPostId;
          threadId;
          authorSessionId;
          content;
          mediaUrl;
          mediaType;
          createdAt = Time.now();
          isDeleted = false;
          linkPreview;
        };
        posts.add(nextPostId, post);
        nextPostId += 1;

        let updatedThread : Thread = {
          thread with
          postCount = thread.postCount + 1;
          lastActivity = Time.now();
        };
        threads.add(threadId, updatedThread);

        post;
      };
    };
  };

  public query ({ caller }) func getPostsByThread(threadId : Nat) : async [Post] {
    let postsList = List.empty<Post>();
    posts.forEach(
      func(_id, post) {
        if (post.threadId == threadId and not post.isDeleted) {
          postsList.add(post);
        };
      }
    );
    postsList.toArray();
  };

  public query ({ caller }) func getAllPosts() : async [Post] {
    let nonDeletedPosts = posts.values().toArray().filter(func(p) { not p.isDeleted });
    let sortedPosts = nonDeletedPosts.sort(
      func(a, b) { Nat.compare(b.id, a.id) }
    );
    if (sortedPosts.size() <= 50) {
      sortedPosts;
    } else {
      Array.tabulate(
        50,
        func(i) { sortedPosts[i] },
      );
    };
  };

  public shared ({ caller }) func deletePost(id : Nat) : async Post {
    switch (posts.get(id)) {
      case (null) { Runtime.trap("Post not found") };
      case (?post) {
        let updatedPost : Post = { post with isDeleted = true };
        posts.add(id, updatedPost);
        updatedPost;
      };
    };
  };

  public shared ({ caller }) func logAction(_action : Text) : async () {
    ();
  };

  public shared ({ caller }) func banUser(sessionId : Text, reason : Text) : async Ban {
    let ban : Ban = {
      sessionId;
      reason;
      timestamp = Time.now();
    };
    bans.add(sessionId, ban);
    ban;
  };

  public shared ({ caller }) func unbanUser(sessionId : Text) : async Bool {
    if (bans.containsKey(sessionId)) {
      bans.remove(sessionId);
      true;
    } else {
      false;
    };
  };

  public query ({ caller }) func getBans() : async [Ban] {
    bans.values().toArray();
  };

  public query ({ caller }) func isBanned(sessionId : Text) : async Bool {
    bans.containsKey(sessionId);
  };

  public shared ({ caller }) func initialize() : async () {
    if (not seeded) {
      ignore await addCategory("Politics");
      ignore await addCategory("Art");
      ignore await addCategory("Entertainment");
      ignore await addCategory("Technology");
      ignore await addCategory("Sports");
      ignore await addCategory("Random");
      seeded := true;
    };
  };

  public shared ({ caller }) func start() : async () {
    await initialize();
  };

  public shared ({ caller }) func registerUser(sessionId : Text, username : Text) : async {
    #ok : UserProfile;
    #err : Text;
  } {
    if (username.size() > 20) {
      return #err("Username exceeds maximum length of 20 characters");
    };

    if (isUsernameTakenInternal(username)) {
      return #err("Username is already taken");
    };

    let profile : UserProfile = {
      sessionId;
      username;
      avatarUrl = null;
      points = 0;
      level = "Newcomer";
      daysActive = 0;
      lastActiveDate = 0;
    };
    userProfiles.add(sessionId, profile);
    #ok(profile);
  };

  public shared ({ caller }) func updateUsername(sessionId : Text, newUsername : Text) : async {
    #ok : UserProfile;
    #err : Text;
  } {
    if (newUsername.size() > 20) {
      return #err("Username exceeds maximum length of 20 characters");
    };

    if (isUsernameTakenInternal(newUsername)) {
      return #err("Username is already taken");
    };

    switch (userProfiles.get(sessionId)) {
      case (null) { #err("User not found") };
      case (?profile) {
        let updatedProfile : UserProfile = {
          profile with username = newUsername
        };
        userProfiles.add(sessionId, updatedProfile);
        #ok(updatedProfile);
      };
    };
  };

  public shared ({ caller }) func setAvatar(sessionId : Text, avatarUrl : ?Text) : async {
    #ok : UserProfile;
    #err : Text;
  } {
    switch (userProfiles.get(sessionId)) {
      case (null) { #err("User not found") };
      case (?profile) {
        let updatedProfile : UserProfile = {
          profile with avatarUrl
        };
        userProfiles.add(sessionId, updatedProfile);
        #ok(updatedProfile);
      };
    };
  };

  public query ({ caller }) func getProfile(sessionId : Text) : async ?UserProfile {
    userProfiles.get(sessionId);
  };

  public query ({ caller }) func getAllProfiles() : async [UserProfile] {
    userProfiles.values().toArray();
  };

  public query ({ caller }) func isUsernameTaken(username : Text) : async Bool {
    isUsernameTakenInternal(username);
  };

  func isUsernameTakenInternal(username : Text) : Bool {
    userProfiles.values().toArray().any(
      func(profile) { profile.username == username }
    );
  };

  public shared ({ caller }) func fetchRumbleThumbnail(url : Text) : async ?Text {
    let pageText = await OutCall.httpGetRequest(url, [], transform);
    findOgTag(pageText, "og:image");
  };

  public shared ({ caller }) func fetchRumbleOgMetadata(url : Text) : async OgMetadata {
    let browserUserAgent : OutCall.Header = {
      name = "User-Agent";
      value = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    };
    let pageText = await OutCall.httpGetRequest(url, [browserUserAgent], transform);

    let title = findOgTag(pageText, "og:title");
    let description = findOgTag(pageText, "og:description");
    let imageUrl = findOgTag(pageText, "og:image");
    let siteName = findOgTag(pageText, "og:site_name");

    {
      title;
      description;
      imageUrl;
      siteName;
    };
  };

  public query ({ caller }) func transform(input : OutCall.TransformationInput) : async OutCall.TransformationOutput {
    OutCall.transform(input);
  };

  func findSubstring(text : Text, pattern : Text) : ?Nat {
    let t = text.toArray();
    let p = pattern.toArray();
    if (p.size() == 0 or p.size() > t.size()) {
      return null;
    };

    var i = 0;
    if (t.size() >= p.size()) {
      while (i <= t.size() - p.size()) {
        var match = true;
        var j = 0;
        while (j < p.size()) {
          if (t[i + j] != p[j]) {
            match := false;
            j := p.size();
          };
          j += 1;
        };
        if (match) {
          return ?i;
        };
        i += 1;
      };
    };
    null;
  };

  func extractRange(text : Text, start : Nat, size : Nat) : Text {
    let textArray = text.toArray();
    if (start >= textArray.size()) {
      return "";
    };
    let rangeEnd = Nat.min(textArray.size(), start + size);
    let rangeArray = Array.tabulate(
      rangeEnd - start,
      func(i) { textArray[start + i] },
    );
    Text.fromIter(rangeArray.values());
  };

  func findOgTag(html : Text, tag : Text) : ?Text {
    // Step 1: find <meta property="og:xxx"
    let needle = "<meta property=\"" # tag # "\"";
    switch (findSubstring(html, needle)) {
      case (null) {
        // fallback: single-quote variant
        let singleNeedle = "<meta property='" # tag # "'";
        switch (findSubstring(html, singleNeedle)) {
          case (null) { null };
          case (?startPos) {
            let sliceLen = Nat.min(500, html.size() - startPos);
            let tagSlice = extractRange(html, startPos, sliceLen);
            // find content='
            switch (findSubstring(tagSlice, "content='")) {
              case (null) { null };
              case (?contentPos) {
                // afterContent starts AFTER the opening single-quote
                let afterStart = contentPos + 9;
                let afterContent = extractRange(tagSlice, afterStart, tagSlice.size());
                switch (findSubstring(afterContent, "'")) {
                  case (null) { null };
                  case (?closePos) {
                    let v = extractRange(afterContent, 0, closePos);
                    if (v.size() > 0) { ?v } else { null };
                  };
                };
              };
            };
          };
        };
      };
      case (?startPos) {
        // Step 2: take 500-char slice from startPos
        let sliceLen = Nat.min(500, html.size() - startPos);
        let tagSlice = extractRange(html, startPos, sliceLen);
        // Step 3: find content=" inside the slice
        switch (findSubstring(tagSlice, "content=\"")) {
          case (null) { null };
          case (?contentPos) {
            // Step 4: afterContent starts AFTER the opening double-quote (skip 9 chars: content=")
            let afterStart = contentPos + 9;
            let afterContent = extractRange(tagSlice, afterStart, tagSlice.size());
            // Step 5: find the closing " in afterContent
            switch (findSubstring(afterContent, "\"")) {
              case (null) { null };
              case (?closePos) {
                // Step 6: extract the clean value
                let v = extractRange(afterContent, 0, closePos);
                if (v.size() > 0) { ?v } else { null };
              };
            };
          };
        };
      };
    };
  };

  public shared ({ caller }) func fetchOgMetadata(url : Text) : async OgMetadata {
    let pageText = await OutCall.httpGetRequest(url, [], transform);

    let title = findOgTag(pageText, "og:title");
    let description = findOgTag(pageText, "og:description");
    let imageUrl = findOgTag(pageText, "og:image");
    let siteName = findOgTag(pageText, "og:site_name");

    {
      title;
      description;
      imageUrl;
      siteName;
    };
  };

  public shared ({ caller }) func fetchRedditPostTitle(url : Text) : async ?Text {
    let metadata = await fetchOgMetadata(url);
    metadata.title;
  };

  public shared ({ caller }) func fetchTwitchThumbnail(url : Text) : async ?Text {
    let pageText = await OutCall.httpGetRequest(url, [], transform);
    findOgTag(pageText, "og:image");
  };

  public shared ({ caller }) func recordView(threadId : Nat, sessionId : Text) : async Bool {
    switch (threads.get(threadId)) {
      case (null) { Runtime.trap("Thread not found") };
      case (?_) {
        let existingViews = switch (threadViews.get(threadId)) {
          case (null) {
            let newList = List.empty<Text>();
            threadViews.add(threadId, newList);
            newList;
          };
          case (?list) { list };
        };

        if (existingViews.any(func(s) { s == sessionId })) {
          return false;
        };

        existingViews.add(sessionId);

        switch (threads.get(threadId)) {
          case (?thread) {
            let updatedThread = {
              thread with
              viewCount = thread.viewCount + 1;
            };
            threads.add(threadId, updatedThread);
            true;
          };
          case (null) { false };
        };
      };
    };
  };

  public shared ({ caller }) func reportThread(threadId : Nat, sessionId : Text, reason : Text) : async ThreadReport {
    switch (threads.get(threadId)) {
      case (null) { Runtime.trap("Thread not found") };
      case (?thread) {
        let report : ThreadReport = {
          id = nextReportId;
          threadId;
          reporterSessionId = sessionId;
          reason;
          createdAt = Time.now();
        };

        threadReports.add(report.id, report);

        let updatedThread : Thread = {
          thread with
          reportCount = thread.reportCount + 1;
        };
        threads.add(threadId, updatedThread);

        nextReportId += 1;
        report;
      };
    };
  };

  public query ({ caller }) func getThreadReports() : async [ThreadReport] {
    threadReports.values().toArray();
  };

  public shared ({ caller }) func awardPoints(sessionId : Text, points : Nat) : async ?UserProfile {
    switch (userProfiles.get(sessionId)) {
      case (null) { null };
      case (?profile) {
        let newTotal = profile.points + points;

        let newLevel = if (newTotal >= 1000) {
          "Elite";
        } else if (newTotal >= 500) {
          "Veteran";
        } else if (newTotal >= 200) {
          "Contributor";
        } else if (newTotal >= 50) {
          "Regular";
        } else {
          "Newcomer";
        };

        let updatedProfile = {
          profile with
          points = newTotal;
          level = newLevel;
        };

        userProfiles.add(sessionId, updatedProfile);
        ?updatedProfile;
      };
    };
  };

  public shared ({ caller }) func checkDailyActivity(sessionId : Text) : async UserProfile {
    switch (userProfiles.get(sessionId)) {
      case (null) { Runtime.trap("User not found") };
      case (?profile) {
        let currentDay = Time.now() / 86400000000000;
        if (profile.lastActiveDate != currentDay) {
          let updatedProfile = {
            profile with
            lastActiveDate = currentDay;
            daysActive = profile.daysActive + 1;
            points = profile.points + 10;
          };

          userProfiles.add(sessionId, updatedProfile);
          updatedProfile;
        } else {
          profile;
        };
      };
    };
  };

  public shared ({ caller }) func addBookmark(sessionId : Text, targetType : Text, targetId : Nat) : async Bookmark {
    let bookmark : Bookmark = {
      id = nextBookmarkId;
      sessionId;
      targetType;
      targetId;
      createdAt = Time.now();
    };

    bookmarks.add(bookmark.id, bookmark);
    nextBookmarkId += 1;
    bookmark;
  };

  public shared ({ caller }) func removeBookmark(_sessionId : Text, bookmarkId : Nat) : async Bool {
    switch (bookmarks.get(bookmarkId)) {
      case (null) { false };
      case (?_) {
        bookmarks.remove(bookmarkId);
        true;
      };
    };
  };

  public query ({ caller }) func getBookmarks(sessionId : Text) : async [Bookmark] {
    bookmarks.values().toArray().filter(func(b) { b.sessionId == sessionId });
  };

  public query ({ caller }) func getSortedThreads() : async [Thread] {
    threads
      .values()
      .toArray()
      .filter(func(t) { not t.isArchived })
      .sort(
        func(a, b) {
          let aScore = (a.postCount * 3) + (a.viewCount * 2) + calculateRecentActivityBonus(a.lastActivity);
          let bScore = (b.postCount * 3) + (b.viewCount * 2) + calculateRecentActivityBonus(b.lastActivity);
          Nat.compare(bScore, aScore);
        }
      );
  };

  func calculateRecentActivityBonus(lastActivity : Int) : Nat {
    let now = Time.now();
    let diff = now - lastActivity;

    if (diff <= 600000000000) { // 10 minutes
      100;
    } else if (diff <= 3600000000000) { // 1 hour
      50;
    } else if (diff <= 86400000000000) { // 24 hours
      10;
    } else {
      0;
    };
  };
};
