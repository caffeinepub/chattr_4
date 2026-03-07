import Map "mo:core/Map";
import Time "mo:core/Time";
import List "mo:core/List";
import Nat "mo:core/Nat";
import Array "mo:core/Array";
import Iter "mo:core/Iter";
import MixinStorage "blob-storage/Mixin";

import Runtime "mo:core/Runtime";


actor {
  include MixinStorage();

  // Data types
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
  };

  type Post = {
    id : Nat;
    threadId : Nat;
    authorSessionId : Text;
    content : Text;
    mediaUrl : ?Text;
    mediaType : Text; // "text", "image", "video", etc.
    createdAt : Int;
    isDeleted : Bool;
  };

  public type Ban = {
    sessionId : Text;
    reason : Text;
    timestamp : Int;
  };

  public type UserProfile = {
    sessionId : Text;
    username : Text;
    avatarUrl : ?Text;
  };

  var nextThreadId = 1;
  var nextPostId = 1;
  var nextCategoryId = 1;
  var seeded = false;

  // Maps
  var categories = Map.empty<Nat, Category>();
  var threads = Map.empty<Nat, Thread>();
  var posts = Map.empty<Nat, Post>();
  var bans = Map.empty<Text, Ban>();
  var userProfiles = Map.empty<Text, UserProfile>();

  // Categories
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

  // Threads
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

  // Posts
  public shared ({ caller }) func createPost(
    threadId : Nat,
    authorSessionId : Text,
    content : Text,
    mediaUrl : ?Text,
    mediaType : Text,
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
        };
        posts.add(nextPostId, post);
        nextPostId += 1;

        // Update thread post count and last activity
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
      Array.tabulate<Post>(
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

  // Logging
  public shared ({ caller }) func logAction(_action : Text) : async () {
    // No-op logging (placeholder)
    // Can be enhanced to store logs if needed
  };

  // Bans
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

  // Seed default categories on first init
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

  // User Profiles
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
};
