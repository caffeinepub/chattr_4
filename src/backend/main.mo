import Map "mo:core/Map";
import Array "mo:core/Array";
import Nat "mo:core/Nat";
import Iter "mo:core/Iter";
import Runtime "mo:core/Runtime";
import Time "mo:core/Time";
import List "mo:core/List";
import MixinStorage "blob-storage/Mixin";
import Storage "blob-storage/Storage";

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
    creatorDisplayId : Text;
    createdAt : Int;
    lastActivity : Int;
    isArchived : Bool;
    isClosed : Bool;
    postCount : Nat;
  };

  type Post = {
    id : Nat;
    threadId : Nat;
    authorDisplayId : Text;
    content : Text;
    mediaUrl : ?Text;
    mediaType : Text; // "text", "image", "video", etc.
    createdAt : Int;
    isDeleted : Bool;
  };

  public type Ban = {
    displayId : Text;
    reason : Text;
    timestamp : Int;
  };

  var nextThreadId = 1;
  var nextPostId = 1;
  var nextCategoryId = 1;
  var seeded = false;

  // Anonymous imageboard/chatroom app Chattr
  var categories = Map.empty<Nat, Category>();
  var threads = Map.empty<Nat, Thread>();
  var posts = Map.empty<Nat, Post>();
  var bans = Map.empty<Text, Ban>();

  // Categories
  public shared ({ caller }) func addCategory(name : Text) : async Category {
    let id = nextCategoryId;
    nextCategoryId += 1;
    let category : Category = { id; name };
    categories.add(id, category);
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
  public shared ({ caller }) func createThread(title : Text, categoryId : Nat, creatorDisplayId : Text) : async Thread {
    let id = nextThreadId;
    nextThreadId += 1;
    let thread : Thread = {
      id;
      title;
      categoryId;
      creatorDisplayId;
      createdAt = Time.now();
      lastActivity = Time.now();
      isArchived = false;
      isClosed = false;
      postCount = 0;
    };
    threads.add(id, thread);
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
    authorDisplayId : Text,
    content : Text,
    mediaUrl : ?Text,
    mediaType : Text,
  ) : async Post {
    switch (threads.get(threadId)) {
      case (null) { Runtime.trap("Thread not found") };
      case (?thread) {
        if (bans.containsKey(authorDisplayId)) {
          Runtime.trap("User is banned");
        };

        let id = nextPostId;
        nextPostId += 1;

        let post : Post = {
          id;
          threadId;
          authorDisplayId;
          content;
          mediaUrl;
          mediaType;
          createdAt = Time.now();
          isDeleted = false;
        };

        posts.add(id, post);

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
  public shared ({ caller }) func banUser(displayId : Text, reason : Text) : async Ban {
    let ban : Ban = {
      displayId;
      reason;
      timestamp = Time.now();
    };
    bans.add(displayId, ban);
    ban;
  };

  public shared ({ caller }) func unbanUser(displayId : Text) : async Bool {
    if (bans.containsKey(displayId)) {
      bans.remove(displayId);
      true;
    } else {
      false;
    };
  };

  public query ({ caller }) func getBans() : async [Ban] {
    bans.values().toArray();
  };

  public query ({ caller }) func isBanned(displayId : Text) : async Bool {
    bans.containsKey(displayId);
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
};

